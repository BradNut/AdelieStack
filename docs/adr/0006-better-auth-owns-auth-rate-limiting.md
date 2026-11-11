---
status: accepted
---

# Better Auth owns rate limiting of `/api/auth/*`, with counters in Redis

Requests to `/api/auth/*` are limited by Better Auth's built-in `rateLimit`, not by our `rateLimit()` Hono middleware. Counters go to the existing Redis through Better Auth's `rateLimit.customStorage`; sessions stay in Postgres. We use `customStorage` rather than `secondaryStorage`, because a secondary storage also takes over sessions and verification tokens unless each is pinned back to the database. Stricter rules cover sign-in, two-factor verification, password reset and passkey endpoints. `DISABLE_RATE_LIMIT` turns the limiter off, as it does for the Hono middleware.

The trigger: `/api/auth/*` is handed straight to `auth.handler`, so our Hono middleware never sees the auth endpoints, and Better Auth's default counters live in memory, which breaks with more than one API instance. Better Auth knows its own endpoints (and their per-path rules), so stacking a second limiter on the same paths would only produce two sets of counters and two sets of headers.

## Consequences

- Auth endpoints are never wrapped in `rateLimit()` from `common/middleware`; that middleware stays for our own routes.
- Limits and windows are shared constants, not literals in `auth.config.ts`.
- Rate-limit storage is the only thing Better Auth keeps in Redis; sessions and verification tokens stay in Postgres.
- Better Auth's limiter counts per client IP and path only, so a distributed attacker is never slowed by it. Failed password sign-ins are also counted per email address, across clients, by our `account-lockout` plugin (`auth/auth.account-lockout.ts`), in the same Redis prefix under hashed keys (`AUTH_ACCOUNT_SIGN_IN_FAILURES`). Second-factor codes are counted per account by Better Auth's own two-factor lockout, pinned to `TWO_FACTOR_ACCOUNT_LOCKOUT` and kept on the two-factor row in Postgres. `DISABLE_RATE_LIMIT` turns the sign-in count off too, but not the two-factor lockout.
- Redis is now required for correct auth rate limiting in multi-instance deployments.

## Considered options

- Wrap the auth handler in our Hono `rateLimit()`: rejected because it limits by URL only and cannot apply Better Auth's per-endpoint rules.
- Better Auth's default in-memory counters: rejected because counters are per-process.
- Database storage for counters: rejected because every auth request would add a write to Postgres when Redis is already present.
