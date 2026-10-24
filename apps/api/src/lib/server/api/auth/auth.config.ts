import {
  APP_NAME,
  AUTH_BASE_PATH,
  AUTH_CLIENT_IP_HEADER,
  AUTH_SESSION_EXPIRES_IN,
  AUTH_SESSION_FRESH_AGE,
  AUTH_SESSION_UPDATE_AGE,
  DEFAULT_COOKIE_ATTRIBUTES,
  LAST_LOGIN_METHOD_COOKIE,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  RoleName,
  TWO_FACTOR_OTP_PERIOD_MINUTES,
} from '@adelie/shared';
import { passkey } from '@better-auth/passkey';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, haveIBeenPwned, lastLoginMethod, openAPI, twoFactor } from 'better-auth/plugins';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { uuidv7 } from '#lib/server/api/common/utils/crypto';
import type * as drizzleSchema from '#lib/server/api/databases/postgres/drizzle-schema';
import type { Mailer } from '#lib/server/api/mail/interfaces/mailer.interface';
import { TwoFactorOtpEmail } from '#lib/server/api/mail/templates/two-factor-otp.template';
import { type CaptchaConfig, captchaPlugin, createCaptchaHealth } from './auth.captcha';
import { createHibpHealth, hibpMonitor } from './auth.hibp-status';
import { createAuthMail } from './auth.mail';
import { createPasswordPolicyHook, HIBP_PLUGIN_PATHS } from './auth.password-policy';
import { ac, roles } from './auth.permissions';
import type { ProviderHealth } from './auth.provider-health';
import { type AuthRateLimitStorage, authRateLimitOptions } from './auth.rate-limit';
import { createRoleGuard } from './auth.role-guard';
import { socialProvidersOption } from './auth.social';

/** Stand-ins for values the schema generator and the seed never use for real (no connection, no env). */
export const AUTH_PLACEHOLDER = {
  secret: 'better-auth-cli-placeholder-secret-0000',
  baseURL: 'http://localhost',
  passkey: { rpID: 'localhost', rpName: APP_NAME, origin: 'http://localhost' },
} as const;

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
  /**
   * Whether anyone may register an account. This is the single gate for sign-up: every sign-up
   * method must honor it (auth.sign-up.test.ts fails when an ungated sign-up endpoint appears).
   * Server-side user creation (the seed, the admin plugin) is not sign-up and is never blocked.
   */
  signUpEnabled: boolean;
  /** Read per request so the env stays lazy. Defaults to off: one role per user. */
  allowMultipleRoles?: () => boolean;
  /** Screens new passwords against Have I Been Pwned. Defaults to on; an outage rejects the request while on. */
  hibpEnabled?: boolean;
  /** Records each HIBP check's outcome for the health surface and carries the on/off switch; overrides `hibpEnabled`. */
  hibpStatus?: ProviderHealth;
  /** Requires a Captcha Token on anonymous auth endpoints. Omit to leave captcha off. */
  captcha?: CaptchaConfig;
  /** Records each verification's outcome for the health surface. */
  captchaStatus?: ProviderHealth;
  /**
   * Where rate-limit counters live. Omit to turn auth rate limiting off (tests, `DISABLE_RATE_LIMIT`);
   * Better Auth's own default would limit in production only, over per-process memory.
   */
  rateLimitStorage?: AuthRateLimitStorage;
  /**
   * Serves Better Auth's API reference at `${AUTH_BASE_PATH}/reference` (and its schema at `/open-api/generate-schema`).
   * Off by default; callers turn it on outside production. It sits below the auth basePath, so it cannot
   * collide with the app's own `/api/reference`.
   */
  openApiReference?: boolean;

  /**
   * Whether the API sits behind a trusted reverse proxy (`TRUST_PROXY`). Only then is the client IP
   * read, from {@link AUTH_CLIENT_IP_HEADER}; otherwise no request header is trusted. Defaults to off.
   */
  trustProxy?: boolean;

  /**
   * Social login providers, already filtered to the configured ones. Omit for none: nothing is registered.
   * The sign-up gate is applied here, so a provider sign-in for an unknown email follows `signUpEnabled`.
   */
  socialProviders?: BetterAuthOptions['socialProviders'];
}

/** Better Auth's Drizzle adapter over our schema. Table names are plural (`users`, `sessions`, ...). */
export function drizzleAuthDatabase(db: NodePgDatabase<typeof drizzleSchema>): BetterAuthOptions['database'] {
  return drizzleAdapter(db, { provider: 'pg', usePlural: true });
}

/**
 * Auth tables use `text` ids from our uuidv7 so they sort roughly by creation time. Domain tables
 * get the same ids from `primaryId()`; ADR 0010 explains why they are not native `uuid`.
 */
export function generateAuthId(): string {
  return uuidv7();
}

/** Cookies are `Secure` whenever the API is served over https. */
function isSecureCookies(baseURL: string): boolean {
  return baseURL.startsWith('https://');
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
  signUpEnabled,
  allowMultipleRoles = () => false,
  hibpEnabled = true,
  hibpStatus = createHibpHealth({ enabled: hibpEnabled }),
  captcha: captchaConfig,
  captchaStatus = createCaptchaHealth({ enabled: Boolean(captchaConfig) }),
  rateLimitStorage,
  openApiReference = false,
  trustProxy = false,
  socialProviders = {},
}: CreateAuthOptions) {
  const authMail = createAuthMail(mailer);
  return betterAuth({
    appName: APP_NAME,
    secret,
    baseURL,
    basePath: AUTH_BASE_PATH,
    trustedOrigins,
    database,
    rateLimit: authRateLimitOptions(rateLimitStorage),
    session: {
      expiresIn: AUTH_SESSION_EXPIRES_IN,
      updateAge: AUTH_SESSION_UPDATE_AGE,
      freshAge: AUTH_SESSION_FRESH_AGE,
      // Every request reads the session row, so a revoked session or a changed role applies at once.
      cookieCache: { enabled: false },
    },
    socialProviders: socialProvidersOption(socialProviders, signUpEnabled),
    account: {
      accountLinking: {
        // A provider sign-in links to the existing account with the same email only when the provider reports
        // that email as verified (and the local one is verified too). No provider is trusted regardless: an
        // unverified email never links. Linking from settings needs the same email on both sides.
        enabled: true,
        trustedProviders: [],
        allowDifferentEmails: false,
        // The last remaining sign-in account cannot be unlinked.
        allowUnlinkingAll: false,
      },
    },
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
      disableSignUp: !signUpEnabled,
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
      // Remembers how the user last signed in, in a browser-readable cookie only (no `storeInDatabase`,
      // so no schema change) for the login page's hint. Not a secret and not used for access decisions.
      lastLoginMethod({ cookieName: LAST_LOGIN_METHOD_COOKIE }),
      // Only registered when captcha is on, so off means no behaviour change. Its `onRequest` runs before every hook.
      ...(captchaConfig ? [captchaPlugin(captchaConfig, captchaStatus)] : []),
      ...(openApiReference ? [openAPI()] : []),
      // Per-plugin before-hook, since the top-level `hooks.before` slot is taken by the password policy.
      {
        id: 'role-guard',
        hooks: { before: [{ matcher: () => true, handler: createRoleGuard(allowMultipleRoles) }] },
      },
    ],
    advanced: {
      ipAddress: { ipAddressHeaders: trustProxy ? [AUTH_CLIENT_IP_HEADER] : [] },
      useSecureCookies: isSecureCookies(baseURL),
      defaultCookieAttributes: { ...DEFAULT_COOKIE_ATTRIBUTES },
      database: {
        generateId: generateAuthId,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session']['session'];
export type AuthUser = Auth['$Infer']['Session']['user'];
