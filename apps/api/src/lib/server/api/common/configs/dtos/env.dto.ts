import {
  APP_ENVS,
  APP_NAME,
  AppEnv,
  CAPTCHA_PROVIDERS,
  DEPLOY_ENVIRONMENTS,
  DeployEnvironment,
  declaresProduction,
  type EnvironmentSettings,
  isLocalDevEnv,
  isProdEnv,
  NODE_ENVS,
  NodeEnv,
  SocialProvider,
} from '@adelie/shared';
import { z } from 'zod/v4';
import { DEVELOPMENT_DEFAULT_NAMES, DevelopmentDefault } from '#lib/server/api/common/configs/development-defaults.constant';
import { findInvalidTrustedProxies } from '#lib/server/api/common/utils/ip';
import { POSTGRES_SSL_MODES, PostgresSslMode } from '#lib/server/api/databases/postgres/postgres-ssl';
import { MailerTransport } from '#lib/server/api/mail/mailer-transport.constant';

/** An env file declares optional variables as `NAME=`; treat that empty string as unset. */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

/** Like {@link emptyAsUndefined}, but also unsets a whitespace-only value, for secrets where blanks are no secret at all. */
const blankAsUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

/** Splits a comma-separated variable, dropping the blanks a stray comma leaves. */
const commaSeparated = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const baseEnvsDto = z.object({
  DATABASE_USER: z.string(),
  DATABASE_PASSWORD: z.string(),
  DATABASE_HOST: z.string(),
  DATABASE_PORT: z.coerce.number(),
  DATABASE_DB: z.string(),
  // TLS to Postgres (libpq sslmode names): disable locally; verify-full checks the certificate, require opts out of that.
  DATABASE_SSL_MODE: z.preprocess(emptyAsUndefined, z.enum(POSTGRES_SSL_MODES).default(PostgresSslMode.DISABLE)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ORIGIN: z.string(),
  DOMAIN: z.string(),
  HOST: z.string().optional(),
  // Email transport: 'mailpit' for local dev, 'unsend' for real sending.
  MAILER_TRANSPORT: z.enum([MailerTransport.MAILPIT, MailerTransport.UNSEND]).default(MailerTransport.MAILPIT),
  // useSend, read only with MAILER_TRANSPORT=unsend, which requires the key and the sender.
  USESEND_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  MAIL_FROM: z.preprocess(emptyAsUndefined, z.string().optional()),
  // The server's address only: the library appends /api/v1 itself. Unset uses https://app.usesend.com.
  USESEND_BASE_URL: z.preprocess(emptyAsUndefined, z.string().optional()),
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
  NODE_ENV: z.enum(NODE_ENVS).default(NodeEnv.DEVELOPMENT),
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
  // Shared secret for authenticating storage object-created webhooks (Bearer token). Required outside local development.
  STORAGE_WEBHOOK_SECRET: z.preprocess(blankAsUndefined, z.string().optional()),
  // Antivirus: scan uploads against a ClamAV (clamd) daemon before persisting.
  ANTIVIRUS_ENABLED: z.stringbool().default(false),
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().default(3310),
  // Storage buckets are named `${PROJECT_NAME}-{public|private}-${ENVIRONMENT}`
  ENVIRONMENT: z.enum(DEPLOY_ENVIRONMENTS).default(DeployEnvironment.DEVELOPMENT),
  PROJECT_NAME: z.string().min(1).default('adelie'),
  SITE_VERSION: z.string().optional(),
  // Security: trusted-proxy handling and the rate-limit kill switch (see rate-limit middleware).
  TRUST_PROXY: z.stringbool().default(false),
  // Proxies (IPs or CIDR ranges) that append to X-Forwarded-For; both rate limiters strip them from the right.
  TRUSTED_PROXIES: z
    .string()
    .default('')
    .transform(commaSeparated)
    .superRefine((entries, ctx) => {
      const invalid = findInvalidTrustedProxies(entries);
      if (invalid.length > 0) ctx.addIssue({ code: 'custom', message: `Not an IP address or CIDR range: ${invalid.join(', ')}` });
    }),
  DISABLE_RATE_LIMIT: z.stringbool().default(false),
  // Observability: Sentry + OpenTelemetry.
  SENTRY_BACKEND_URL: z.union([z.url(), z.literal('')]).optional(),
  OTEL_ENABLED: z.stringbool().default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().default('http://localhost:4318/v1/traces'),
});

const CAPTCHA_REQUIRED_WHEN_ENABLED = ['CAPTCHA_PROVIDER', 'CAPTCHA_SECRET_KEY', 'CAPTCHA_SITE_KEY'] as const;
const USESEND_REQUIRED_WHEN_SELECTED = ['USESEND_API_KEY', 'MAIL_FROM'] as const;

/** Each social provider's credential pair of env names; one half set without the other is a misconfiguration. */
export const SOCIAL_PROVIDER_ENV_NAMES = {
  [SocialProvider.GITHUB]: { id: 'GITHUB_CLIENT_ID', secret: 'GITHUB_CLIENT_SECRET' },
  [SocialProvider.GOOGLE]: { id: 'GOOGLE_CLIENT_ID', secret: 'GOOGLE_CLIENT_SECRET' },
} as const satisfies Record<SocialProvider, { id: keyof z.infer<typeof baseEnvsDto>; secret: keyof z.infer<typeof baseEnvsDto> }>;

/** Suffix of every message refusing a setting that only local development may use. */
const REFUSED_IN_PRODUCTION = '(refused in production)';

export const SHARED_RATE_LIMIT_BUCKET_MESSAGE =
  'Auth rate limiting is on but TRUST_PROXY is off: every client shares one rate-limit bucket per auth path, so a few requests lock everyone out. Set TRUST_PROXY=true behind a trusted proxy, or DISABLE_RATE_LIMIT=true.';

/**
 * Auth rate limiting keys clients by IP. Without a trusted proxy no IP header is read, so every client would
 * share one bucket per path: a handful of requests would lock everyone out of sign-in. In production that is
 * refused at startup; turn the limiter off explicitly (`DISABLE_RATE_LIMIT`) or declare the proxy (`TRUST_PROXY`).
 */
export function sharesOneRateLimitBucket(envs: Pick<z.infer<typeof baseEnvsDto>, 'TRUST_PROXY' | 'DISABLE_RATE_LIMIT'>): boolean {
  return !envs.DISABLE_RATE_LIMIT && !envs.TRUST_PROXY;
}

/**
 * Only a developer's own machine may run the storage webhook unauthenticated. `ENV` defaults to `dev` and a deploy may
 * set only `NODE_ENV=production`, so the deploy settings ({@link isLocalDevEnv}) decide, and `ENV=prod` always requires it.
 */
function runsWithoutWebhookSecret(envs: EnvironmentSettings): boolean {
  return !isProdEnv(envs.ENV) && isLocalDevEnv(envs);
}

/**
 * Refuses production on settings only fit for local development: a credential this repo publishes, the local mail
 * inbox, or auth served without TLS. Messages name the variable and never print its value.
 */
function refuseDevelopmentDefaults(envs: z.infer<typeof baseEnvsDto>, ctx: z.RefinementCtx): void {
  if (!isProdEnv(envs.ENV)) {
    ctx.addIssue({
      code: 'custom',
      path: ['ENV'],
      message: `ENV must be ${AppEnv.PROD} when NODE_ENV or ENVIRONMENT is production: ${AppEnv.DEV} turns off the production protections`,
    });
  }
  for (const name of DEVELOPMENT_DEFAULT_NAMES) {
    if (envs[name] === DevelopmentDefault[name]) {
      ctx.addIssue({ code: 'custom', path: [name], message: `${name} still holds its public development default ${REFUSED_IN_PRODUCTION}` });
    }
  }
  if (envs.MAILER_TRANSPORT === MailerTransport.MAILPIT) {
    ctx.addIssue({
      code: 'custom',
      path: ['MAILER_TRANSPORT'],
      message: `MAILER_TRANSPORT ${MailerTransport.MAILPIT} is the local inbox ${REFUSED_IN_PRODUCTION}; use ${MailerTransport.UNSEND}`,
    });
  }
  if (new URL(envs.BETTER_AUTH_URL).protocol !== 'https:') {
    ctx.addIssue({ code: 'custom', path: ['BETTER_AUTH_URL'], message: `BETTER_AUTH_URL must use https ${REFUSED_IN_PRODUCTION}` });
  }
}

export const envsDto = baseEnvsDto.superRefine((envs, ctx) => {
  if (declaresProduction(envs)) refuseDevelopmentDefaults(envs, ctx);
  if (isProdEnv(envs.ENV) && sharesOneRateLimitBucket(envs)) {
    ctx.addIssue({
      code: 'custom',
      path: ['TRUST_PROXY'],
      message: `${SHARED_RATE_LIMIT_BUCKET_MESSAGE} ${REFUSED_IN_PRODUCTION}`,
    });
  }
  if (!runsWithoutWebhookSecret(envs) && envs.STORAGE_WEBHOOK_SECRET === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['STORAGE_WEBHOOK_SECRET'],
      message: 'STORAGE_WEBHOOK_SECRET is required outside local development: without it anyone can drive the storage webhook',
    });
  }
  for (const { id: idName, secret: secretName } of Object.values(SOCIAL_PROVIDER_ENV_NAMES)) {
    if ((envs[idName] === undefined) !== (envs[secretName] === undefined)) {
      const missing = envs[idName] === undefined ? idName : secretName;
      ctx.addIssue({ code: 'custom', path: [missing], message: `${idName} and ${secretName} must be set together` });
    }
  }
  if (envs.MAILER_TRANSPORT === MailerTransport.UNSEND) {
    for (const name of USESEND_REQUIRED_WHEN_SELECTED) {
      if (envs[name] === undefined)
        ctx.addIssue({ code: 'custom', path: [name], message: `${name} is required when MAILER_TRANSPORT is ${MailerTransport.UNSEND}` });
    }
  }
  if (!envs.CAPTCHA_ENABLED) return;
  for (const name of CAPTCHA_REQUIRED_WHEN_ENABLED) {
    if (envs[name] === undefined) ctx.addIssue({ code: 'custom', path: [name], message: `${name} is required when CAPTCHA_ENABLED is true` });
  }
});

export type EnvsDto = z.infer<typeof envsDto>;
