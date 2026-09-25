# API Environment Configuration

Reference: `apps/api/.env.example`

## Critical

| Variable | Example | Notes |
|---|---|---|
| `ORIGIN` | `https://secondchancepuzzles.com` | Allowed CORS origin. Must match web app public URL. |
| `DOMAIN` | `secondchancepuzzles.com` | Hostname only. Used for session cookie domain. |
| `PORT` | `3001` | API server port. |
| `DATABASE_HOST` | `postgres` | DB hostname. |
| `DATABASE_PORT` | `5432` | DB port. |
| `DATABASE_USER` | `postgres` | DB user. |
| `DATABASE_PASSWORD` | `<secret>` | DB password. |
| `DATABASE_DB` | `postgres` | DB name. |
| `REDIS_URL` | `redis://redis:6379` | Used for sessions, rate limiting, BullMQ queues. |
| `ENCRYPTION_KEY` | `<random>` | Generate: `openssl rand -base64 32`. Encrypts sensitive fields. |
| `SIGNING_SECRET` | `<random>` | Generate: `openssl rand -base64 32`. Signs tokens. |
| `MFA_ENCRYPTION_KEY` | `<random>` | Generate: `openssl rand -base64 16`. Encrypts MFA secrets. |
| `STORAGE_URL` | `http://storage:8333` | S3 endpoint URL (SeaweedFS S3 API locally). |
| `STORAGE_ACCESS_KEY` | `<key>` | S3 access key. |
| `STORAGE_SECRET_KEY` | `<secret>` | S3 secret key. |
| `STORAGE_HOST` | `storage` | S3 hostname. |
| `STORAGE_PORT` | `8333` | S3 port (SeaweedFS default `8333`). |
| `STORAGE_SSL` | `false` | `true` if storage is behind HTTPS. |
| `PUBLIC_IMAGE_URI` | `https://storage.example.com/adelie-public-production` | Public bucket base URI. |
| `PROJECT_NAME` | `adelie` | Bucket namespace: `<PROJECT_NAME>-{public,private}-<ENVIRONMENT>`. |
| `ENVIRONMENT` | `production` | `development`, `staging`, or `production`; bucket name suffix. |
| `TURNSTILE_SECRET_KEY` | `<key>` | Cloudflare Turnstile server secret. |
| `API_KEY` | `<key>` | Unsend email API key. |
| `API_BASE_URL` | `app.usesend.com/api/` | Unsend email base URL. |
| `SITE_NAME` | `Second Chance Puzzles` | Used in email templates. |
| `SITE_URL` | `https://secondchancepuzzles.com` | Used in email link generation. |
| `SUPPORT_EMAIL` | `support@example.com` | Reply-to for outbound emails. |

## MFA Feature Flags

| Variable | Default | Notes |
|---|---|---|
| `MFA_TOTP_ENABLED` | `true` | Enable TOTP authenticator app. |
| `MFA_PASSKEY_ENABLED` | `false` | Enable passkey MFA. |
| `MFA_SECURITY_KEY_ENABLED` | `false` | Enable security key MFA. |

## Antivirus

| Variable | Default | Notes |
|---|---|---|
| `ANTIVIRUS_ENABLED` | `true` | Enable ClamAV scanning on uploads. |
| `CLAMAV_HOST` | `localhost` | ClamAV daemon host. |
| `CLAMAV_PORT` | `3310` | ClamAV daemon port. |

## Migration / Seeding

| Variable | Default | Notes |
|---|---|---|
| `DB_MIGRATING` | `false` | Set `true` to run migrations on start (Docker sets this automatically). |
| `DB_SEEDING` | `false` | Set `true` to run seed after migration. |
| `ADMIN_USERNAME` | — | Seed admin user login. |
| `ADMIN_PASSWORD` | — | Seed admin user password. |

## Optional

| Variable | Notes |
|---|---|
| `SHOW_OAUTH_BUTTONS` | `true` to enable OAuth login. Default `false`. |
| `TRUST_PROXY` | `true` if behind a reverse proxy (sets `app.set('trust proxy', 1)`). |
| `OTEL_ENABLED` | `true` to enable OpenTelemetry tracing. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP trace endpoint. |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | Sentry error tracking. |
| `LOG_LEVEL` | Pino log level. Default `debug` in dev. |

## Local Dev Setup

```bash
cp apps/api/.env.example apps/api/.env
# Edit: DATABASE_*, REDIS_URL, ENCRYPTION_KEY, SIGNING_SECRET, MFA_ENCRYPTION_KEY
pnpm --filter @secondchance/api dev
```

## Related

- [Deployment](./deployment.md)
- [Database Migrations](./database-migrations.md)
