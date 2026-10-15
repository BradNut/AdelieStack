import { APP_ENVS, APP_NAME, AppEnv, CAPTCHA_PROVIDERS, SocialProvider } from '@adelie/shared';
import { z } from 'zod/v4';
import { MailerTransport } from '#lib/server/api/mail/mailer-transport.constant';

/** An env file declares optional variables as `NAME=`; treat that empty string as unset. */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

const baseEnvsDto = z.object({
  DATABASE_USER: z.string(),
  DATABASE_PASSWORD: z.string(),
  DATABASE_HOST: z.string(),
  DATABASE_PORT: z.coerce.number(),
  DATABASE_DB: z.string(),
  DB_MIGRATING: z.stringbool().default(false),
  DB_SEEDING: z.stringbool().default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ORIGIN: z.string(),
  DOMAIN: z.string(),
  HOST: z.string().optional(),
  // Email transport: 'mailpit' for local dev, 'unsend' for real sending.
  MAILER_TRANSPORT: z.enum([MailerTransport.MAILPIT, MailerTransport.UNSEND]).default(MailerTransport.MAILPIT),
  REDIS_URL: z.string(),
  // Background jobs: register BullMQ queues/workers on startup. Disable in tests/CI
  // or one-off processes that must not open a Redis worker connection.
  JOBS_ENABLED: z.stringbool().default(true),
  SIGNING_SECRET: z.string().min(1, 'SIGNING_SECRET must not be empty'),
  // Better Auth: secret for signing/encrypting auth cookies and tokens, and the public base URL
  // the auth endpoints are served from (the web origin, which proxies /api to this server).
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.url(),
  // Name shown in authenticator apps when a user enrols TOTP two-factor.
  TWO_FACTOR_ISSUER: z.string().min(1).default(APP_NAME),
  // WebAuthn relying party for passkeys: the registrable domain the browser runs on (no scheme
  // or port) and the name shown in the passkey prompt. Passkeys only work on a matching origin.
  PASSKEY_RP_ID: z.string().min(1).default('localhost'),
  PASSKEY_RP_NAME: z.string().min(1).default(APP_NAME),
  // Registration: closed unless an operator opts in. Closed means no one can create an account
  // through sign-up; users come from the seeded admin and the admin plugin's create-user.
  SIGN_UP_ENABLED: z.stringbool().default(false),
  // Whether a user may hold several roles (stored comma-separated). Off: a multi-valued row is invalid.
  ALLOW_MULTIPLE_ROLES: z.stringbool().default(false),
  // Screen new passwords against Have I Been Pwned. Turn off to mitigate an HIBP outage (restart required).
  HIBP_ENABLED: z.stringbool().default(true),
  // Captcha on anonymous auth endpoints. Off by default; when on, provider, secret and site key are required.
  CAPTCHA_ENABLED: z.stringbool().default(false),
  CAPTCHA_PROVIDER: z.preprocess(emptyAsUndefined, z.enum(CAPTCHA_PROVIDERS).optional()),
  CAPTCHA_SECRET_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  CAPTCHA_SITE_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  // reCAPTCHA v3 only: scores below this are rejected.
  CAPTCHA_MIN_SCORE: z.preprocess(emptyAsUndefined, z.coerce.number().min(0).max(1).optional()),
  // Social login: a provider is on only when both its client id and secret are set.
  GITHUB_CLIENT_ID: z.preprocess(emptyAsUndefined, z.string().optional()),
  GITHUB_CLIENT_SECRET: z.preprocess(emptyAsUndefined, z.string().optional()),
  GOOGLE_CLIENT_ID: z.preprocess(emptyAsUndefined, z.string().optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess(emptyAsUndefined, z.string().optional()),
  ENV: z.enum(APP_ENVS),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.coerce.number(),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  STORAGE_HOST: z.string(),
  STORAGE_PORT: z.coerce.number(),
  STORAGE_ACCESS_KEY: z.string(),
  STORAGE_SECRET_KEY: z.string(),
  STORAGE_SSL: z.stringbool().default(false),
  STORAGE_URL: z.string(),
  PUBLIC_IMAGE_URI: z.string(),
  // Shared secret for authenticating storage object-created webhooks (Bearer token).
  STORAGE_WEBHOOK_SECRET: z.string().optional(),
  // Antivirus: scan uploads against a ClamAV (clamd) daemon before persisting.
  ANTIVIRUS_ENABLED: z.stringbool().default(false),
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().default(3310),
  // Storage buckets are named `${PROJECT_NAME}-{public|private}-${ENVIRONMENT}`
  ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('development'),
  PROJECT_NAME: z.string().min(1).default('adelie'),
  SITE_VERSION: z.string().optional(),
  // Security: trusted-proxy handling and the rate-limit kill switch (see rate-limit middleware).
  TRUST_PROXY: z.stringbool().default(false),
  DISABLE_RATE_LIMIT: z.stringbool().default(false),
  // Observability: Sentry + OpenTelemetry.
  SENTRY_BACKEND_URL: z.union([z.url(), z.literal('')]).optional(),
  OTEL_ENABLED: z.stringbool().default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().default('http://localhost:4318/v1/traces'),
});

const CAPTCHA_REQUIRED_WHEN_ENABLED = ['CAPTCHA_PROVIDER', 'CAPTCHA_SECRET_KEY', 'CAPTCHA_SITE_KEY'] as const;

/** Each social provider's credential pair of env names; one half set without the other is a misconfiguration. */
export const SOCIAL_PROVIDER_ENV_NAMES = {
  [SocialProvider.GITHUB]: { id: 'GITHUB_CLIENT_ID', secret: 'GITHUB_CLIENT_SECRET' },
  [SocialProvider.GOOGLE]: { id: 'GOOGLE_CLIENT_ID', secret: 'GOOGLE_CLIENT_SECRET' },
} as const satisfies Record<SocialProvider, { id: keyof z.infer<typeof baseEnvsDto>; secret: keyof z.infer<typeof baseEnvsDto> }>;

export const SHARED_RATE_LIMIT_BUCKET_WARNING =
  'Auth rate limiting is on but TRUST_PROXY is off: every client shares one rate-limit bucket per auth path, so a few requests lock everyone out. Set TRUST_PROXY=true behind a trusted proxy, or DISABLE_RATE_LIMIT=true.';

/**
 * Auth rate limiting keys clients by IP. Without a trusted proxy no IP header is read, so every client would
 * share one bucket per path: a handful of requests would lock everyone out of sign-in. In production that is
 * refused at startup; turn the limiter off explicitly (`DISABLE_RATE_LIMIT`) or declare the proxy (`TRUST_PROXY`).
 */
export function sharesOneRateLimitBucket(envs: Pick<z.infer<typeof baseEnvsDto>, 'TRUST_PROXY' | 'DISABLE_RATE_LIMIT'>): boolean {
  return !envs.DISABLE_RATE_LIMIT && !envs.TRUST_PROXY;
}

export const envsDto = baseEnvsDto.superRefine((envs, ctx) => {
  if (envs.ENV === AppEnv.PROD && sharesOneRateLimitBucket(envs)) {
    ctx.addIssue({
      code: 'custom',
      path: ['TRUST_PROXY'],
      message: `${SHARED_RATE_LIMIT_BUCKET_WARNING} (refused in production)`,
    });
  }
  for (const { id: idName, secret: secretName } of Object.values(SOCIAL_PROVIDER_ENV_NAMES)) {
    if ((envs[idName] === undefined) !== (envs[secretName] === undefined)) {
      const missing = envs[idName] === undefined ? idName : secretName;
      ctx.addIssue({ code: 'custom', path: [missing], message: `${idName} and ${secretName} must be set together` });
    }
  }
  if (!envs.CAPTCHA_ENABLED) return;
  for (const name of CAPTCHA_REQUIRED_WHEN_ENABLED) {
    if (envs[name] === undefined) ctx.addIssue({ code: 'custom', path: [name], message: `${name} is required when CAPTCHA_ENABLED is true` });
  }
});

export type EnvsDto = z.infer<typeof envsDto>;
