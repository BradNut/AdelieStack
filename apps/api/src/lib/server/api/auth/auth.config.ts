import { APP_NAME, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, RoleName } from '@adelie/shared';
import { passkey } from '@better-auth/passkey';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, haveIBeenPwned, twoFactor } from 'better-auth/plugins';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { uuidv7 } from '../common/utils/crypto';
import type * as drizzleSchema from '../databases/postgres/drizzle-schema';
import type { Mailer } from '../mail/interfaces/mailer.interface';
import { TwoFactorOtpEmail } from '../mail/templates/two-factor-otp.template';
import { type CaptchaConfig, CaptchaStatus, captchaPlugin } from './auth.captcha';
import { HibpStatus, hibpMonitor } from './auth.hibp-status';
import { createAuthMail } from './auth.mail';
import { createPasswordPolicyHook, HIBP_PLUGIN_PATHS } from './auth.password-policy';
import { ac, roles } from './auth.permissions';

/** Prefix of every API route. */
export const API_BASE_PATH = '/api';

/** Path of the auth handler below {@link API_BASE_PATH}; the Hono app routes `${AUTH_ROUTE}/*` to it. */
export const AUTH_ROUTE = '/auth';

/** Better Auth mounts its handler here. */
export const AUTH_BASE_PATH = `${API_BASE_PATH}${AUTH_ROUTE}`;

/** Stand-ins for values the schema generator and the seed never use for real (no connection, no env). */
export const AUTH_PLACEHOLDER = {
  secret: 'better-auth-cli-placeholder-secret-0000',
  baseURL: 'http://localhost',
  passkey: { rpID: 'localhost', rpName: APP_NAME, origin: 'http://localhost' },
} as const;

/** Minutes an emailed two-factor code stays valid. */
export const TWO_FACTOR_OTP_PERIOD_MINUTES = 5;

/** WebAuthn relying-party settings. `origin` must be the web origin the browser runs on. */
export interface PasskeyConfig {
  rpID: string;
  rpName: string;
  origin: string;
}

export interface CreateAuthOptions {
  database: BetterAuthOptions['database'];
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  /** Name shown in authenticator apps for TOTP enrolment. */
  twoFactorIssuer: string;
  passkey: PasskeyConfig;
  mailer: Mailer;
  /** Screens new passwords against Have I Been Pwned. Defaults to on; an outage rejects the request while on. */
  hibpEnabled?: boolean;
  /** Records each HIBP check's outcome for the health surface and carries the on/off switch; overrides `hibpEnabled`. */
  hibpStatus?: HibpStatus;
  /** Requires a Captcha Token on anonymous auth endpoints. Omit to leave captcha off. */
  captcha?: CaptchaConfig;
  /** Records each verification's outcome for the health surface. */
  captchaStatus?: CaptchaStatus;
}

/** Better Auth's Drizzle adapter over our schema. Table names are plural (`users`, `sessions`, ...). */
export function drizzleAuthDatabase(db: NodePgDatabase<typeof drizzleSchema>): BetterAuthOptions['database'] {
  return drizzleAdapter(db, { provider: 'pg', usePlural: true });
}

/** Auth tables use `text` ids from our uuidv7 so they sort by creation time like domain ids. */
export function generateAuthId(): string {
  return uuidv7();
}

/**
 * Builds the Better Auth instance. Pure: it opens no connections, so callers control when
 * it is created (lazily at runtime via {@link AuthService}, with a mock db for the CLI, or
 * over the memory adapter in tests).
 */
export function createAuth({
  database,
  secret,
  baseURL,
  trustedOrigins,
  twoFactorIssuer,
  passkey: passkeyConfig,
  mailer,
  hibpEnabled = true,
  hibpStatus = new HibpStatus({ enabled: hibpEnabled }),
  captcha: captchaConfig,
  captchaStatus = new CaptchaStatus({ enabled: Boolean(captchaConfig) }),
}: CreateAuthOptions) {
  const authMail = createAuthMail(mailer);
  return betterAuth({
    appName: APP_NAME,
    secret,
    baseURL,
    basePath: AUTH_BASE_PATH,
    trustedOrigins,
    database,
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: authMail.sendVerificationEmail,
    },
    user: {
      // The confirmation link goes to the new address (through `sendVerificationEmail`); the old
      // address is told afterwards by the `/verify-email` after hook.
      changeEmail: { enabled: true },
      // Needs the account password (or a fresh session). Sessions, accounts, two-factor and passkey
      // rows go with the user: the foreign keys cascade (see auth.delete-user.test.ts).
      deleteUser: { enabled: true },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      sendResetPassword: authMail.sendResetPassword,
      onPasswordReset: authMail.notifyPasswordChanged,
    },
    hooks: {
      before: createPasswordPolicyHook(hibpStatus),
      after: authMail.afterHook,
    },
    plugins: [
      // Roles live in the user's `role` field. The plugin declares it `input: false`, so no
      // sign-up or update-user body can set it; only admin endpoints (or the server) can.
      admin({
        ac,
        roles,
        defaultRole: RoleName.USER,
        adminRoles: [RoleName.ADMIN],
      }),
      // TOTP, emailed OTP and recovery (backup) codes. TOTP secrets and backup codes are
      // encrypted with the auth secret. Enrolment is confirmed with a first valid code.
      twoFactor({
        issuer: twoFactorIssuer,
        otpOptions: {
          period: TWO_FACTOR_OTP_PERIOD_MINUTES,
          async sendOTP({ user, otp }) {
            await mailer.send({ to: user.email, template: new TwoFactorOtpEmail(otp, TWO_FACTOR_OTP_PERIOD_MINUTES) });
          },
        },
      }),
      // Passkeys and hardware security keys (WebAuthn). The relying party comes from env.
      passkey({
        rpID: passkeyConfig.rpID,
        rpName: passkeyConfig.rpName,
        origin: passkeyConfig.origin,
      }),
      // Rejects breached passwords (`PASSWORD_COMPROMISED`) while hashing, and fails closed when HIBP is
      // unreachable. With `enabled: false` it makes no HIBP request on any path. Admin create-user and
      // reset-password are screened earlier, in the before-hook (see auth.password-policy.ts).
      haveIBeenPwned({ enabled: hibpStatus.enabled, paths: [...HIBP_PLUGIN_PATHS] }),
      // Must come after haveIBeenPwned: it wraps that plugin's hashing to record each check's outcome.
      hibpMonitor(hibpStatus),
      // Only registered when captcha is on, so off means no behaviour change. Its `onRequest` runs before every hook.
      ...(captchaConfig ? [captchaPlugin(captchaConfig, captchaStatus)] : []),
    ],
    advanced: {
      database: {
        generateId: generateAuthId,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session']['session'];
export type AuthUser = Auth['$Infer']['Session']['user'];
