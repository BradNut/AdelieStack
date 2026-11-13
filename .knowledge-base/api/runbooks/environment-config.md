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
  A production deploy must set `ENV=prod` explicitly: `ENV` defaults to `dev`, and the API refuses to start when `NODE_ENV` or `ENVIRONMENT` says production but `ENV` does not (see [Production refusals](#production-refusals)).
- `ORIGIN` is the allowed CORS / session origin; `DOMAIN` (hostname only) is the session cookie
  domain.
- `DB_MIGRATING` and `DB_SEEDING` are for the `db:migrate` and `db:seed` scripts only: each script
  refuses to run unless its flag resolves to true (varlock normalizes `TRUE`, `1` and `yes` to
  `true` first; `false` refuses), and both default to `false`. The seed also refuses whenever `ENV`,
  `NODE_ENV` or `ENVIRONMENT` declares production, since it truncates every table; migrations still run there. Set them on the command rather than in an env file. The running API ignores them and always uses its normal
  connection pool, and neither flag starts a migration or seed by itself.
- Seeding the admin needs `ADMIN_PASSWORD`, at least 15 characters (the seed fails on a shorter one). With `SIGN_UP_ENABLED` false and no password set, the
  seed warns that nobody can sign in.
- `SIGNING_SECRET` is required and sensitive; generate it with `openssl rand -hex 32`.
- A database reached over a network needs `DATABASE_SSL_MODE=verify-full` (see [Database TLS](#database-tls)).
- Local setup: `cp apps/api/.env.schema apps/api/.env`, fill `DATABASE_*`, `REDIS_URL`,
  `SIGNING_SECRET` and `STORAGE_*`, then `pnpm --filter @adelie/api dev`.

## Production refusals

The schema's defaults make a fresh clone run locally, and every one of them is public in this repo. So when any setting declares production (`ENV=prod`, `NODE_ENV=production` or `ENVIRONMENT=production`; the image sets `NODE_ENV=production`), the API refuses to start on the development values below. The error names each variable and never prints its value; it lists every refusal at once. Development, staging on `ENV=dev`, tests and the e2e suite are unaffected. The checks live in `envsDto` (`apps/api/src/lib/server/api/common/configs/dtos/env.dto.ts`); the refused credentials are `DevelopmentDefault` in `common/configs/development-defaults.constant.ts`, which a test keeps in sync with `.env.schema`.

| Variable | Refused in production | Fix |
|---|---|---|
| `ENV` | `dev` while `NODE_ENV` or `ENVIRONMENT` is `production` | Set `ENV=prod`. On `dev` the other production protections (secure cookie, rate-limit check, no auth API reference) stay off. |
| `DATABASE_PASSWORD` | `postgres`, the local Postgres password | Set the real database password. |
| `STORAGE_ACCESS_KEY` | `adelie-local-access-key`, the local SeaweedFS key | Set the provider's access key. |
| `STORAGE_SECRET_KEY` | `adelie-local-secret-key`, the local SeaweedFS secret | Set the provider's secret key. |
| `MAILER_TRANSPORT` | `mailpit`, also as the default when unset | Set `unsend` with `USESEND_API_KEY` and `MAIL_FROM` (see [Email](#email)). |
| `BETTER_AUTH_URL` | Any URL not on `https` | Serve the web origin over TLS and set its `https://` URL. |

Two more production checks have their own sections: `TRUST_PROXY` with rate limiting on (`ENV=prod` only, see [Auth rate limiting](#auth-rate-limiting)) and a missing `STORAGE_WEBHOOK_SECRET` (everywhere but local development, see `.env.schema`).

## Email

`MAILER_TRANSPORT` is `mailpit` (the default, the local inbox) or `unsend` (real sending through useSend, see [Infrastructure](./infrastructure.md#email--usesend-in-production-mailpit-locally)). With `mailpit`, none of the variables below is read. Restart after changing them.

| Variable | Required with `unsend` | Notes |
|---|---|---|
| `USESEND_API_KEY` | yes | Sensitive. The API refuses to start without it (the error names it). |
| `MAIL_FROM` | yes | Sender address; must be on a domain verified in useSend. The API refuses to start without it (the error names it). |
| `USESEND_BASE_URL` | no | The server's address only, e.g. `https://app.usesend.com` or a self-hosted useSend. The library appends `/api/v1` itself, so do not include `/api` or a trailing slash. Unset or empty means `https://app.usesend.com`. |

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
| `HIBP_ENABLED` | `true` | Screens new passwords against Have I Been Pwned (Better Auth `haveIBeenPwned` plugin) on sign-up, change-password and admin set-user-password. When on, an unreachable HIBP **rejects** the request (fail closed) and nothing is changed. When `false`, no HIBP request is made on any path, including seeding (`pnpm db:seed` reads the same switch and fails during an outage while it is on; the seed truncates every table first, so a seed that fails this way leaves the database empty). Restart the API after changing it. |

### HIBP outage

- **Symptom**: sign-up, reset-password, change-password and admin password changes fail with `503 PASSWORD_CHECK_UNAVAILABLE`; the forms show "We can't verify your password right now". Sign-in is unaffected.
- **Find it**: every failed check writes one error log entry starting with `HIBP_CHECK_FAILED` (grep the API logs for it). `/api/healthz` is public and says only that the API is up, so it stays `{ "status": "ok" }` during an outage. Entries appear only when a password is checked. Whether screening is on is the deployment's `HIBP_ENABLED` value.
- **Mitigate**: set `HIBP_ENABLED=false` and restart the API. Breached passwords are accepted until you set it back to `true` and restart.

## Auth rate limiting

Better Auth's own limiter guards every `/api/auth/*` request, keyed by client IP and path. Counters live in Redis (key prefix `auth-rate-limit:`), so limits hold across API instances; sessions stay in Postgres. Decision: `docs/adr/0006-better-auth-owns-auth-rate-limiting.md`. The app's own `rateLimit()` middleware is not applied to auth routes.

- **Rules**: `AUTH_RATE_LIMIT_DEFAULT` (100 a minute) and the per-path `AUTH_RATE_LIMIT_RULES` in `packages/shared/src/constants/auth-rate-limits.ts`. Change limits there, not in `auth.config.ts`.
  - **Strict** (`AUTH_RATE_LIMIT_STRICT`, 5 a minute): email sign-in; the two-factor verify endpoints (TOTP, OTP, backup code); and the password-checking two-factor endpoints (disable, get TOTP URI, generate backup codes).
  - **Email** (`AUTH_RATE_LIMIT_EMAIL`, 3 per 5 minutes): the endpoints that send an email: emailing a two-factor code, requesting a password reset and resending the verification email. Without its own rule, the verification email would fall back to Better Auth's built-in 3 a minute. The window is derived from `TWO_FACTOR_OTP_PERIOD_MINUTES`, how long an emailed code stays valid.
    - Counted per client IP, like every auth rule: it stops one client flooding an inbox, not many IPs sending to the same account. There is no per-account cap.
  - **Own rules**: email sign-up (`AUTH_RATE_LIMIT_SIGN_UP`, 10 an hour), resetting a password and passkey. Sign-up only matters once sign-up is open; the limit is against bulk account creation and sending verification emails to many addresses. It is not the email rule: a sign-up with an existing address is refused (422) with no email, so sign-up cannot flood one inbox, and a tighter per-IP limit would block people signing up together from a shared IP. Duplicate-address attempts still count toward it.
  - **Default**: social sign-in starts and enabling two-factor. The rule table pins `/sign-in/*` and `/two-factor/*` to the default, because Better Auth's own built-in limit for those paths is much tighter and applies otherwise.
  - **Better Auth's built-in limit** (3 per 10 seconds) applies, unless a rule matches, to every path starting with `/sign-in`, `/sign-up`, `/change-password` or `/change-email`, and (via the two-factor plugin) `/two-factor/`. These paths never fall back to `AUTH_RATE_LIMIT_DEFAULT` on their own. `/change-password` and `/change-email` have no rule of ours and stay on the built-in limit.
  - **New endpoints**: a new credential or code-guessing endpoint needs its own exact entry, above the wildcards. Tests fail when an exact entry comes after a wildcard that matches it, when an endpoint starting with `/sign-in`, `/sign-up` or `/two-factor` (with or without a slash) has no exact entry and is not deliberately on the default, and when a deliberately-default path no longer exists or has gained an exact entry. That allow-list is `AUTH_RATE_LIMIT_DEFAULT_PATHS`, next to the rules.
- **Throttled response**: `429` with an `X-Retry-After` header (seconds).
- **`DISABLE_RATE_LIMIT=true`**: auth rate limiting is off and Redis is not touched by auth. Restart the API after changing it. Use it for tests and controlled environments only.
- **Client IP and `TRUST_PROXY`**: the limiter reads the client IP from `X-Forwarded-For` only when `TRUST_PROXY=true`; otherwise it reads no header, and every client shares one bucket per path (for example 5 sign-in attempts a minute for the whole site). The web app's `/api` proxy always sets `X-Forwarded-For`, so set `TRUST_PROXY=true` whenever the API is reachable only through the web proxy or another trusted proxy, and make sure that proxy either overwrites the header or is declared in `TRUSTED_PROXIES`. Leave it off only when the API is exposed directly.
- **The header a proxy must set**: `X-Forwarded-For` (`AUTH_CLIENT_IP_HEADER`). It is the only header read for the client IP, by this limiter and by the app's own `rateLimit()` middleware, and both resolve it the same way. A proxy has two ways to set it:
  - **Overwrite**: the proxy sets it to exactly one address, the client's, replacing any value the client sent. No further setting is needed. Traffic through the web app is this case and needs no proxy change: the web tier replaces `X-Forwarded-For` with the address it read through `ADDRESS_HEADER` (see the [web deployment runbook](../../web/runbooks/deployment.md#client-address-behind-a-proxy)).
  - **Append** (for example nginx `$proxy_add_x_forwarded_for`, or Traefik and most load balancers in front of the API directly): declare every proxy that appends in `TRUSTED_PROXIES`.
- **`TRUSTED_PROXIES`**: comma-separated IPs or CIDR ranges, such as `10.0.0.0/8,192.0.2.10`, IPv4 or IPv6. Used only with `TRUST_PROXY=true`, and passed to both limiters, but always validated: an invalid entry refuses startup even with `TRUST_PROXY=false`. Each limiter strips the chain from the right to the first address that is not declared, and that address is the client, so anything a client prepends is ignored. The error names `TRUSTED_PROXIES`. IPv4-mapped IPv6 addresses count as their IPv4 address, and an IPv6 client is limited as its /64. Declare every appending hop, in any order: an undeclared hop is taken for the client, and all traffic through it shares its bucket.
- **What counts as no client address**: with no proxies declared, only a single valid IP counts; a chain or an invalid value resolves to no address. With proxies declared, an invalid value reached while walking from the right, or a chain of only declared proxies, resolves to no address. Those requests share one bucket per path in this limiter, as do anonymous ones in `rateLimit()` (signed-in users key on `userId`), so clients can lock each other out. `X-Real-IP` and `CF-Connecting-IP` are ignored, so a client cannot pick its bucket by sending them. A proxy in front of the API directly that sets only one of those must change to set `X-Forwarded-For`, even with `TRUST_PROXY=true`.
- **Log warning `no usable client address`**: with `TRUST_PROXY=true`, the API logs a warning that names `x-forwarded-for` when a request has no usable client address, on an `/api/auth/*` route or an anonymous request through `rateLimit()`, at most once every 5 minutes per process. It never includes header values and appears in the logs only; no endpoint reports it. It means those clients share one rate-limit bucket. Check the proxy in front of the API: it must set `X-Forwarded-For`, even if it already sets `X-Real-IP` or `CF-Connecting-IP`. A chain with no proxies declared, or a chain made up only of declared proxies, also triggers it: declare each appending proxy in `TRUSTED_PROXIES`, and check that the client's address is in the header. Health checks to `/healthz` are not rate limited and do not trigger it. With `DISABLE_RATE_LIMIT=true` it is not logged, because no bucket exists to share. On `/api/auth/*` routes, unless `NODE_ENV` is `development`, `dev` or `test`, Better Auth also logs its own warning, once per process, starting `Rate limiting could not determine a client IP and is falling back to a single shared per-path bucket`; it names Better Auth settings (`advanced.ipAddress.*`), which here come from `TRUST_PROXY` and `TRUSTED_PROXIES`, so the fix is the same. With those `NODE_ENV` values Better Auth stays silent, since it keys such requests on `127.0.0.1`; our warning still fires with `TRUST_PROXY=true`, for example on a request sent to the API directly without `X-Forwarded-For`.
- **Startup check**: with `ENV=prod`, auth rate limiting on and `TRUST_PROXY` off, the API refuses to start (the error names `TRUST_PROXY`); fix it with `TRUST_PROXY=true` or, deliberately, `DISABLE_RATE_LIMIT=true`. Outside prod it starts but logs a warning with the same advice. Why not silently disable the limiter instead: that would quietly drop brute-force protection, whereas a refusal makes the operator pick; a shared bucket locks every user out after a few requests, so it is never the right steady state.
- **Redis outage** (also applies to the `rateLimit()` route middleware): a request whose limit check cannot reach Redis fails with a server error rather than skipping the limit.

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
- **Find it**: every failed verification writes one error log entry starting with `CAPTCHA_VERIFY_FAILED` (grep the API logs for it). `/api/healthz` is public and says only that the API is up, so it stays `{ "status": "ok" }` during an outage. Entries appear only when a token is verified. Whether captcha is on is the deployment's `CAPTCHA_ENABLED` value.
- **Mitigate**: set `CAPTCHA_ENABLED=false` and restart the API. The protected endpoints are unchallenged until you set it back to `true` and restart.

## Database TLS

`DATABASE_SSL_MODE` decides whether Postgres connections use TLS. One setting covers the running API's pool, the `db:migrate` and `db:seed` scripts and drizzle-kit (`db:push`, `db:studio`), so query traffic, session tokens and password hashes never cross the network in the clear while the migration tooling encrypts. The values follow libpq's `sslmode` names:

| Value | Behaviour | Use it for |
|---|---|---|
| `disable` (default) | No TLS. | Local development, and a database on the same host or a private Docker network. |
| `verify-full` | TLS, and the server certificate must chain to a trusted CA and match `DATABASE_HOST`. A bad or self-signed certificate fails the connection. | Any database reached over a network, including managed Postgres. |
| `require` | TLS without checking the certificate. Traffic is encrypted but anyone on the path can impersonate the server. | Only as an explicit, temporary opt-out when the provider's CA cannot be trusted yet. |

- Unset or empty means `disable`, so a fresh clone needs nothing. An unknown value (`true`, `prefer`, a different case) stops the API at startup and makes the scripts and drizzle-kit throw; nothing falls back to plain text.
- Certificates are checked against Node's bundled CAs. For a provider whose CA is not among them (for example AWS RDS), download its bundle and point `NODE_EXTRA_CA_CERTS` at the PEM file for the API and the scripts rather than switching to `require`.
- Postgres must have TLS enabled: with `verify-full` or `require` the client refuses a server that does not offer it.
- drizzle-kit reads `process.env` and `apps/api/.env` only (not `.env.local` or the schema defaults), so for `db:push` and `db:studio` against a remote database set `DATABASE_SSL_MODE` on the command or in `.env`, as with the other `DATABASE_*` values.
- The pure mapping lives in `databases/postgres/postgres-ssl.ts` (`postgresSsl`); the env DTO validates against its modes, and `drizzle.service.ts` (the API pool), `drizzle.client.ts` (the scripts) and `drizzle.config.ts` all call it.
- **Upgrading:** drizzle-kit used to turn TLS on by itself for any `DATABASE_HOST` other than `localhost`; it now follows `DATABASE_SSL_MODE` and defaults to `disable`. If you run `db:push`, `db:studio` or drizzle-kit migrations against a remote database, set `DATABASE_SSL_MODE=verify-full` or those commands connect without TLS (or fail where the server insists on it).

## Storage

Buckets: `${PROJECT_NAME}-public-${ENVIRONMENT}` and `${PROJECT_NAME}-private-${ENVIRONMENT}`.
The API creates missing buckets at startup and refuses to start if storage is unreachable.
`pnpm storage:setup` provisions them without starting the API. Credentials must match
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
