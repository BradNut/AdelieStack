# IAM (Identity & Access Management) Service

## Purpose

Who a person is and what they may do: sign-up, sign-in, sessions, email verification, password
reset, social login, roles and permissions. There is no IAM module of our own: Better Auth owns all
of it, configured in `apps/api/src/lib/server/api/auth/` and served at `/api/auth/*`.

## Responsibilities

Better Auth endpoints under `/api/auth` (its own request and response shapes, outside the
`api-contract` RPC types; the web uses the Better Auth Svelte client):

- Email and password sign-up and sign-in (`/sign-up/email`, `/sign-in/email`), gated by `SIGN_UP_ENABLED`
- Social sign-in and account linking (GitHub, Google) when configured (`/sign-in/social`)
- Sign-out, listing and revoking sessions (`/sign-out`, `/list-sessions`, `/revoke-session`, `/revoke-other-sessions`, `/revoke-sessions`)
- Email verification (`/send-verification-email`, `/verify-email`) and email change
- Password reset by emailed link (`/request-password-reset`, `/reset-password`) and password change (`/change-password`)
- Account deletion (`/delete-user`)
- Admin endpoints (`/admin/*`: list, ban, set role, revoke a user's sessions, ...)
- Second factors and passkeys: see the [MFA overview](../mfa/overview.md)

Our own routes only read the session: `GET /api/users/me` (Users service) and anything guarded by
`requirePermission`.

## Key Concepts

### Request flow
1. `ApplicationController.registerControllers` hands `/api/auth/*` straight to
   `AuthService.auth.handler`, before any other route.
2. For every other route, the `authSession` middleware calls `auth.api.getSession` and sets
   `c.var.user` and `c.var.session` (`null` when signed out).
3. Protected routes use `requirePermission` (`common/middleware/permission.middleware.ts`), which
   asks Better Auth's `userHasPermission` for the user's roles. Routes name permissions, never roles
   ([ADR 0002](../../../../docs/adr/0002-authorization-delegates-to-better-auth.md)).

### Sessions
- Stored in the Postgres `sessions` table, not Redis. The cookie cache is off, so every request
  reads the row and a revoked session or changed role applies at once.
- Lifetimes come from `packages/shared/src/constants/auth-session.ts`: a session lasts 7 days after
  its last refresh (`AUTH_SESSION_EXPIRES_IN`), is extended at most once a day
  (`AUTH_SESSION_UPDATE_AGE`), and counts as fresh for 5 minutes after sign-in
  (`AUTH_SESSION_FRESH_AGE`). Sensitive actions refuse a session that is not fresh; the web then
  re-authenticates (see the web glossary's Fresh Session and Re-authentication).
- Cookies are `Secure` when `BETTER_AUTH_URL` is https; attributes come from `DEFAULT_COOKIE_ATTRIBUTES`.

### Roles
Stored on `users.role` by the admin plugin (`admin`, `support`, `user`); see the
[data model](./data-model.md) and the glossary's Role and Role Policy.

## Technology Stack

- **Auth**: Better Auth with the `admin`, `twoFactor`, `passkey`, `haveIBeenPwned`, `lastLoginMethod`
  and (when enabled) `captcha` plugins, plus `openAPI` outside production (reference at `/api/auth/reference`)
- **Database**: PostgreSQL via Better Auth's Drizzle adapter (`auth/tables/auth.table.ts`, generated)
- **Rate limiting**: Better Auth's limiter with counters in Redis
  ([ADR 0006](../../../../docs/adr/0006-better-auth-owns-auth-rate-limiting.md))
- **Email**: our `MailerService`, through templates in `mail/templates/`

## Service Structure

```
apps/api/src/lib/server/api/auth/
├── auth.service.ts               # owns the single Better Auth instance, created lazily from env
├── auth.config.ts                # createAuth: every Better Auth option and plugin
├── auth.cli.ts                   # config for `pnpm --filter @adelie/api auth:generate`
├── auth.mail.ts                  # verification, reset and security-event emails
├── auth.password-policy.ts       # before-hook: password rules and HIBP screening on admin paths
├── auth.permissions.ts, roles.ts # permission table and Role Policy
├── auth.role-guard.ts            # before-hook: several roles on admin role writes only with ALLOW_MULTIPLE_ROLES
├── auth.social.ts                # GitHub / Google from env
├── auth.captcha.ts, auth.hibp-status.ts, auth.provider-health.ts
├── auth.rate-limit.ts, auth.rate-limit.repository.ts
├── tables/auth.table.ts          # generated Drizzle schema; never hand-edit
└── tests/
```

## Security Considerations

- Passwords: length rules from `MIN_PASSWORD_LENGTH` / `MAX_PASSWORD_LENGTH`, breached passwords
  rejected through Have I Been Pwned (fails closed when HIBP is unreachable).
- Rate limits per client IP and path, with strict rules on credential and code checks and an email
  rule on endpoints that send email.
- Optional captcha on sign-up, sign-in, password reset request and verification email
  ([ADR 0004](../../../../docs/adr/0004-captcha-via-better-auth-plugin.md)).
- Sign-up is closed by default ([ADR 0003](../../../../docs/adr/0003-sign-up-closed-by-default.md)).
- Security Events (password changed, Recovery Codes used or regenerated, email changed) email the user.
- Password sign-in has no account lockout beyond rate limiting. Second-factor verification locks
  per account after 10 failed attempts for 15 minutes (Better Auth's `accountLockout` defaults;
  `two_factors.failed_verification_count`, `locked_until`).

Operational details for each of these are in the
[environment config runbook](../../runbooks/environment-config.md).

## Dependencies

### Internal
- `ConfigService` (env), `DrizzleService` (Postgres), `MailerService`, `LoggerService`
- `AuthRateLimitRepository` over `RedisService` (rate-limit counters only)
- `@adelie/shared`: session, cookie, rate-limit, role and password constants

### External
- `better-auth`, `@better-auth/passkey`
- Have I Been Pwned and the configured Captcha Provider, when enabled

## Related Documentation

- [Business Processes](./business-processes.md)
- [Context](./context.md)
- [Data Model](./data-model.md)
- [Runbook](./runbook.md)
