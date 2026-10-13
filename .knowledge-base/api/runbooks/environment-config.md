# API Environment Configuration

Reference: `apps/api/.env.schema` — the varlock (`@env-spec`) source of truth for every env var
the API reads. Real values live in `.env` (local, gitignored) or `.env.local` (personal
overrides, gitignored, highest precedence) — never commit real secrets to `.env.schema`.

## Environment

| Variable | Example | Notes |
|---|---|---|
| `ENVIRONMENT` | `development` | `development`, `staging`, or `production`; also used as the storage bucket name suffix. |
| `ENV` | `dev` | Legacy short-form flag (`dev` or `prod`) consumed by several services. |
| `NODE_ENV` | `development` | `development` or `production`; optional. |

## Server

| Variable | Example | Notes |
|---|---|---|
| `ORIGIN` | `http://localhost:5173` | Allowed CORS / session origin. Default is the local web dev URL. |
| `DOMAIN` | `localhost` | Hostname only. Used for session cookie domain. |
| `PORT` | `3001` | API server port. |
| `HOST` | `0.0.0.0` | Bind address; optional. |
| `LOG_LEVEL` | `debug` | Pino log level. |
| `SITE_VERSION` | — | Semver string; optional. |

## Database

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_USER` | `postgres` | DB user. |
| `DATABASE_PASSWORD` | `postgres` | DB password. |
| `DATABASE_HOST` | `localhost` | DB hostname. |
| `DATABASE_PORT` | `5432` | DB port. |
| `DATABASE_DB` | `postgres` | DB name. |

## Drizzle / Seed

| Variable | Default | Notes |
|---|---|---|
| `DB_MIGRATING` | `false` | Set `true` to run migrations on start (Docker sets this automatically). |
| `DB_SEEDING` | `false` | Set `true` to run seed after migration. |
| `ADMIN_EMAIL` | `admin@example.com` | Seed admin user email; optional. `ADMIN_PASSWORD` is required to seed. |
| `ADMIN_PASSWORD` | — | Seed admin user password. With `SIGN_UP_ENABLED` false and no password set, the seed warns that nobody can sign in. |

## Registration

| Variable | Default | Notes |
|---|---|---|
| `SIGN_UP_ENABLED` | `false` | Allow anyone to register. Closed by default: accounts then come from the seeded admin and the admin plugin's create-user. Set `true` for local dev and the e2e suite. Read at startup; the web app learns it from the public `GET /api/config`. See [ADR 0002](../../../docs/adr/0002-sign-up-closed-by-default.md). |

## Security

| Variable | Notes |
|---|---|
| `SIGNING_SECRET` | Required, sensitive. Generate with `openssl rand -hex 32`. |

## Breached-password screening (Have I Been Pwned)

| Variable | Default | Notes |
|---|---|---|
| `HIBP_ENABLED` | `true` | Screens new passwords against Have I Been Pwned (Better Auth `haveIBeenPwned` plugin) on sign-up, change-password and admin set-user-password. When on, an unreachable HIBP **rejects** the request (fail closed) and nothing is changed. When `false`, no HIBP request is made on any path. Restart the API after changing it. |

### HIBP outage

- **Symptom**: sign-up, reset-password, change-password and admin password changes fail with `503 PASSWORD_CHECK_UNAVAILABLE`; the forms show "We can't verify your password right now". Sign-in is unaffected.
- **Find it**: every failed check writes one error log entry starting with `HIBP_CHECK_FAILED` (grep for it). `GET /healthz` returns `hibp`: `available` (last check succeeded), `unavailable` (last check failed), `unknown` (no check since start) or `disabled` (`HIBP_ENABLED=false`). Health probes read the last result and never call HIBP, so `hibp` only changes when a password is checked. The overall `status` stays `ok`.
- **Mitigate**: set `HIBP_ENABLED=false` and restart the API. Breached passwords are accepted until you set it back to `true` and restart.

## Captcha

Protects sign-up, sign-in, request-password-reset and send-verification-email (`CAPTCHA_PROTECTED_PATHS`) with Better Auth's `captcha` plugin. Passkey, OAuth and session-bound endpoints are never challenged. Off by default. Decision: `docs/adr/0002-captcha-via-better-auth-plugin.md`.

| Variable | Default | Notes |
|---|---|---|
| `CAPTCHA_ENABLED` | `false` | When `true`, the three variables below are required and the API refuses to start without them (the error names the missing one). When `false`, none is read and no provider is contacted. Restart after changing it. |
| `CAPTCHA_PROVIDER` | — | `cloudflare-turnstile`, `google-recaptcha`, `hcaptcha` or `captchafox`. The web ships widgets for Turnstile and hCaptcha only. |
| `CAPTCHA_SECRET_KEY` | — | Sensitive. Stays on the API; never returned by any endpoint. |
| `CAPTCHA_SITE_KEY` | — | Public key. The web reads it, with the provider, from `GET /api/config/captcha`, so the web needs no captcha env. hCaptcha and CaptchaFox also check tokens against it. |
| `CAPTCHA_MIN_SCORE` | provider default (0.5) | reCAPTCHA v3 only, 0 to 1. |

`GET /api/config/captcha` is public and returns only `{ enabled, provider, siteKey }` (`{ enabled: false }` when off).

The token travels in the `x-captcha-response` header. A missing token is `400 MISSING_RESPONSE`; one the provider refuses is `403 VERIFICATION_FAILED`.

### Test keys for your own CI

Run CI with captcha disabled, or enable it with a provider's published test keys (they accept any token):

| Provider | Site key | Secret key |
|---|---|---|
| Cloudflare Turnstile | `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` |
| Google reCAPTCHA v2 | `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI` | `6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe` |
| hCaptcha | `10000000-ffff-ffff-ffff-000000000001` | `0x0000000000000000000000000000000000000000` |

The reCAPTCHA keys above are v2 and always pass, so they do not exercise `CAPTCHA_MIN_SCORE`; Google publishes no v3 test keys. CaptchaFox publishes no test keys either: for those two, use a real site from the provider's dashboard.

### Captcha outage

- **Symptom**: protected forms fail with `503 CAPTCHA_UNAVAILABLE`; the forms show "Captcha is temporarily unavailable". Passkey and OAuth sign-in are unaffected. An invalid token is a different, 4xx answer.
- **Find it**: every failed verification writes one error log entry starting with `CAPTCHA_VERIFY_FAILED` (grep for it). `GET /healthz` returns `captcha`: `available` (last verification reached the provider), `unavailable` (last one did not), `unknown` (none since start) or `disabled`. Probes read the last result and never call the provider, so `captcha` only changes when a token is verified. The overall `status` stays `ok`.
- **Mitigate**: set `CAPTCHA_ENABLED=false` and restart the API. The protected endpoints are unchallenged until you set it back to `true` and restart.

## Redis

| Variable | Example | Notes |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Used for sessions, rate limiting, and cached lookups. |

## Storage (SeaweedFS S3 locally; any S3-compatible provider in production)

Buckets: `${PROJECT_NAME}-public-${ENVIRONMENT}` and `${PROJECT_NAME}-private-${ENVIRONMENT}`.
Provision locally with `pnpm storage:setup`. Credentials must match
`docker/seaweedfs/s3-config.json`.

| Variable | Example | Notes |
|---|---|---|
| `PROJECT_NAME` | `adelie` | Bucket namespace prefix. |
| `STORAGE_URL` | `http://localhost:8333` | S3 endpoint URL. |
| `STORAGE_ACCESS_KEY` | `adelie-local-access-key` | S3 access key. |
| `STORAGE_SECRET_KEY` | `adelie-local-secret-key` | S3 secret key. |
| `STORAGE_HOST` | `localhost` | S3 hostname. |
| `STORAGE_PORT` | `8333` | S3 port (SeaweedFS default `8333`). |
| `STORAGE_SSL` | `false` | `true` if storage is behind HTTPS. |
| `PUBLIC_IMAGE_URI` | `http://localhost:8333/adelie-public-development` | Public bucket base URI. |

## Sentry (backend)

| Variable | Notes |
|---|---|
| `SENTRY_BACKEND_URL` | Sentry DSN/URL for backend error tracking; optional. |

## OpenTelemetry (Observability)

| Variable | Notes |
|---|---|
| `OTEL_ENABLED` | `true` to enable OpenTelemetry tracing. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP trace endpoint, e.g. `http://localhost:4318/v1/traces`. |

## Local Dev Setup

```bash
cp apps/api/.env.schema apps/api/.env
# Edit real values: DATABASE_*, REDIS_URL, SIGNING_SECRET, STORAGE_*
pnpm --filter @adelie/api dev
```

## Related

- [Deployment](./deployment.md)
- [Database Migrations](./database-migrations.md)

## Leak scanner and storage credentials

Varlock's response scanner throws when a response body contains any `@sensitive` value. The local
storage defaults are deliberately long and unique (`adelie-local-*`) so ordinary response text such as
`"user"` or `"password"` can never match. Do not shorten them to common words.

Manual check that the scanner still works: run the API and temporarily return
`env.STORAGE_SECRET_KEY` from a route (for example `/health`). The request must fail with
`DETECTED LEAKED SENSITIVE CONFIG - STORAGE_SECRET_KEY`.
`local-storage-credentials.test.ts` guards that the defaults stay collision-free and in sync with
`docker/seaweedfs/s3-config.json` and `scripts/setup-seaweedfs.sh`.
