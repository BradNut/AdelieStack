# API Environment Configuration

Reference: `apps/api/.env.schema` — the varlock (`@env-spec`) source of truth for every env var
the API reads: names, types and defaults. Real values live in `.env` (local, gitignored) or
`.env.local` (personal overrides, gitignored, highest precedence) — never commit real secrets to
`.env.schema`. This runbook keeps what the schema cannot say: behaviour, gotchas and outage
procedures.

## Gotchas

- `ENVIRONMENT` (`development`, `staging`, `production`) also suffixes the storage bucket names.
  `ENV` (`dev` or `prod`, `AppEnv` in `@adelie/shared`) is a legacy short-form flag several services still read; it controls the
  session cookie's `secure` flag, pretty logs, SQL logging and Better Auth's API reference (`/api/auth/reference`, off in prod). The app's own `/api/reference` is mounted regardless of `ENV`.
- `ORIGIN` is the allowed CORS / session origin; `DOMAIN` (hostname only) is the session cookie
  domain.
- `DB_MIGRATING=true` runs migrations on start (Docker sets it automatically); `DB_SEEDING=true`
  seeds after migration.
- Seeding the admin needs `ADMIN_PASSWORD`. With `SIGN_UP_ENABLED` false and no password set, the
  seed warns that nobody can sign in.
- `SIGNING_SECRET` is required and sensitive; generate it with `openssl rand -hex 32`.
- Local setup: `cp apps/api/.env.schema apps/api/.env`, fill `DATABASE_*`, `REDIS_URL`,
  `SIGNING_SECRET` and `STORAGE_*`, then `pnpm --filter @adelie/api dev`.

## Registration

| Variable | Default | Notes |
|---|---|---|
| `SIGN_UP_ENABLED` | `false` | Allow anyone to register. Closed by default: accounts then come from the seeded admin and the admin plugin's create-user. Set `true` for local dev and the e2e suite. Read at startup; the web app learns it from the public `GET /api/config`. See [ADR 0003](../../../docs/adr/0003-sign-up-closed-by-default.md). |

## Social login (GitHub, Google)

Optional. A provider is registered with Better Auth only when **both** its client id and secret are set; with none set, nothing is registered, `GET /api/config` returns `socialProviders: []` and the login page shows no social buttons. Setting only one half of a pair stops the API at startup (the error names the missing variable). Credentials stay on the API and are never returned by any endpoint. Restart after changing them.

| Variable | Notes |
|---|---|
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | From a GitHub OAuth App (Settings, Developer settings, OAuth Apps). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From a Google Cloud OAuth 2.0 Client ID of type "Web application". |

### Provider setup

1. Create the OAuth app with the **authorization callback URL** `<BETTER_AUTH_URL>/api/auth/callback/github` (or `/google`). `BETTER_AUTH_URL` is the web origin (for example `http://localhost:5173` locally), because the web app proxies `/api` to the API. For Google also add that origin as an authorized JavaScript origin.
2. Put the id and secret in `apps/api/.env.local` and restart the API.
3. Open `/login`: a button per configured provider appears.

### Behaviour

- **Linking**: a social sign-in whose provider reports a **verified** email matching an existing account links to it, provided that account's own email is verified too. An unverified provider email, an unverified local email, or a different email never links (a different email creates a separate account if sign-up is open). No provider is trusted regardless of verification. GitHub's verified flag comes from its `/user/emails` data.
- **Settings**: signed-in users link and unlink providers at `/settings/connected-accounts`. Linking needs the provider email to equal the account email. Unlinking needs a fresh session (sign in again if refused) and is refused for the last remaining sign-in account, which is a Better Auth rule: the password counts as one, passkeys and two-factor do not.
- **Sign-up gate**: with `SIGN_UP_ENABLED=false`, a social sign-in for an unknown email is rejected (`?error=signup_disabled` on the login page) and creates no user; existing users still sign in socially. See [ADR 0003](../../../docs/adr/0003-sign-up-closed-by-default.md).
- **Captcha**: OAuth endpoints are never challenged.

## Breached-password screening (Have I Been Pwned)

| Variable | Default | Notes |
|---|---|---|
| `HIBP_ENABLED` | `true` | Screens new passwords against Have I Been Pwned (Better Auth `haveIBeenPwned` plugin) on sign-up, change-password and admin set-user-password. When on, an unreachable HIBP **rejects** the request (fail closed) and nothing is changed. When `false`, no HIBP request is made on any path. Restart the API after changing it. |

### HIBP outage

- **Symptom**: sign-up, reset-password, change-password and admin password changes fail with `503 PASSWORD_CHECK_UNAVAILABLE`; the forms show "We can't verify your password right now". Sign-in is unaffected.
- **Find it**: every failed check writes one error log entry starting with `HIBP_CHECK_FAILED` (grep for it). `GET /healthz` returns `hibp`: `available` (last check succeeded), `unavailable` (last check failed), `unknown` (no check since start) or `disabled` (`HIBP_ENABLED=false`). Health probes read the last result and never call HIBP, so `hibp` only changes when a password is checked. The overall `status` stays `ok`.
- **Mitigate**: set `HIBP_ENABLED=false` and restart the API. Breached passwords are accepted until you set it back to `true` and restart.

## Auth rate limiting

Better Auth's own limiter guards every `/api/auth/*` request, keyed by client IP and path. Counters live in Redis (key prefix `auth-rate-limit:`), so limits hold across API instances; sessions stay in Postgres. Decision: `docs/adr/0006-better-auth-owns-auth-rate-limiting.md`. The app's own `rateLimit()` middleware is not applied to auth routes.

- **Rules**: `AUTH_RATE_LIMIT_DEFAULT` (100 a minute) and the per-path `AUTH_RATE_LIMIT_RULES` in `packages/shared/src/constants/auth-rate-limits.ts`. Change limits there, not in `auth.config.ts`.
  - **Strict** (`AUTH_RATE_LIMIT_STRICT`, 5 a minute): email sign-in; the two-factor verify endpoints (TOTP, OTP, backup code); and the password-checking two-factor endpoints (disable, get TOTP URI, generate backup codes).
  - **Email** (`AUTH_RATE_LIMIT_EMAIL`, 3 per 5 minutes): the endpoints that send an email: emailing a two-factor code, requesting a password reset and resending the verification email. Without its own rule, the verification email would fall back to Better Auth's built-in 3 a minute. The window is derived from `TWO_FACTOR_OTP_PERIOD_MINUTES`, how long an emailed code stays valid.
    - Counted per client IP, like every auth rule: it stops one client flooding an inbox, not many IPs sending to the same account. There is no per-account cap.
  - **Own rules**: resetting a password and passkey.
  - **Default**: social sign-in starts and enabling two-factor. The rule table pins `/sign-in/*` and `/two-factor/*` to the default, because Better Auth's own built-in limit for those paths is much tighter and applies otherwise.
  - **New endpoints**: a new credential or code-guessing endpoint needs its own exact entry, above the wildcards. Tests fail when an exact entry comes after a wildcard that matches it, when an endpoint starting with `/sign-in` or `/two-factor` (with or without a slash) has no exact entry and is not deliberately on the default, and when a deliberately-default path no longer exists or has gained an exact entry. That allow-list is `AUTH_RATE_LIMIT_DEFAULT_PATHS`, next to the rules.
- **Throttled response**: `429` with an `X-Retry-After` header (seconds).
- **`DISABLE_RATE_LIMIT=true`**: auth rate limiting is off and Redis is not touched by auth. Restart the API after changing it. Use it for tests and controlled environments only.
- **Client IP and `TRUST_PROXY`**: the limiter reads the client IP from `X-Forwarded-For` only when `TRUST_PROXY=true`; otherwise it reads no header, and every client shares one bucket per path (for example 5 sign-in attempts a minute for the whole site). The web app's `/api` proxy always sets `X-Forwarded-For`, so set `TRUST_PROXY=true` whenever the API is reachable only through the web proxy or another trusted proxy, and make sure that proxy overwrites the header rather than appending client-supplied values. Leave it off only when the API is exposed directly.
- **Startup check**: with `ENV=prod`, auth rate limiting on and `TRUST_PROXY` off, the API refuses to start (the error names `TRUST_PROXY`); fix it with `TRUST_PROXY=true` or, deliberately, `DISABLE_RATE_LIMIT=true`. Outside prod it starts but logs a warning with the same advice. Why not silently disable the limiter instead: that would quietly drop brute-force protection, whereas a refusal makes the operator pick; a shared bucket locks every user out after a few requests, so it is never the right steady state.
- **Redis outage**: a request whose limit check cannot reach Redis fails with a server error rather than skipping the limit.

## Captcha

Protects sign-up, sign-in, request-password-reset and send-verification-email (`CAPTCHA_PROTECTED_PATHS`) with Better Auth's `captcha` plugin. Passkey, OAuth and session-bound endpoints are never challenged. Off by default. Decision: `docs/adr/0004-captcha-via-better-auth-plugin.md`.

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

## Storage

Buckets: `${PROJECT_NAME}-public-${ENVIRONMENT}` and `${PROJECT_NAME}-private-${ENVIRONMENT}`.
Provision locally with `pnpm storage:setup`. Credentials must match
`docker/seaweedfs/s3-config.json`. SeaweedFS S3 runs locally; production takes any S3-compatible
provider. `PUBLIC_IMAGE_URI` is the public bucket base URI and must equal the web app's value.

## Leak scanner and storage credentials

Varlock's response scanner throws when a response body contains any `@sensitive` value. The local
storage defaults are deliberately long and unique (`adelie-local-*`) so ordinary response text such as
`"user"` or `"password"` can never match. Do not shorten them to common words.

Manual check that the scanner still works: run the API and temporarily return
`env.STORAGE_SECRET_KEY` from a route (for example `/health`). The request must fail with
`DETECTED LEAKED SENSITIVE CONFIG - STORAGE_SECRET_KEY`.
`local-storage-credentials.test.ts` guards that the defaults stay collision-free and in sync with
`docker/seaweedfs/s3-config.json` and `scripts/setup-seaweedfs.sh`.

## Related

- [Deployment](./deployment.md)
- [Database Migrations](./database-migrations.md)
