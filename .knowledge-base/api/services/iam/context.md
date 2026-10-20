# IAM Service Context

## Service Boundaries

### What IAM Owns
- Everything under `/api/auth/*`, served by Better Auth: sign-up, sign-in (password, passkey,
  social), second factors, sessions, email verification and change, password reset and change,
  account deletion, admin user management
- Session resolution for the rest of the app (`authSession` middleware)
- Authorization checks for our routes (`requirePermission`, `auth.permissions.ts`, `roles.ts`)

### What IAM Does NOT Own
- Current-user profile route (`GET /api/users/me`): the Users service (`UsersController`), which
  reads `c.var.user`
- Email delivery: the Mailer service; IAM only chooses templates and recipients (`auth/auth.mail.ts`)
- Audit trail: the `audit/` module; Better Auth endpoints do not write audit entries

## Service Dependencies

### Upstream Dependencies (IAM depends on)

#### PostgreSQL (`DrizzleService`)
- **Purpose**: users, sessions, accounts, verifications, two-factor and passkey rows
- **Failure Impact**: no sign-in, and every request that resolves a session fails
- **Fallback**: none

#### Redis (`RedisService`, through `AuthRateLimitRepository`)
- **Purpose**: auth rate-limit counters only; sessions are not in Redis
- **Failure Impact**: a request whose limit check cannot reach Redis fails rather than skipping the limit
- **Fallback**: none; `DISABLE_RATE_LIMIT=true` turns auth rate limiting off

#### Mailer (`MailerService`)
- **Purpose**: verification links, reset links, emailed two-factor codes, Security Events
- **Usage**: `MAILER_TRANSPORT=mailpit` posts to Mailpit; `unsend` selects `ProdMailerService`,
  which today only logs (see the [runbook](./runbook.md))

#### Have I Been Pwned and the Captcha Provider (optional)
- **Purpose**: breached-password screening; Captcha Token verification
- **Failure Impact**: HIBP unreachable → password-setting requests fail with
  `503 PASSWORD_CHECK_UNAVAILABLE`; captcha unreachable → protected requests fail with
  `503 CAPTCHA_UNAVAILABLE`. Both are reported by `/api/healthz`.

### Downstream Dependencies (code that depends on IAM)

- `authSession` middleware, on every route after `/api/auth/*`: sets `c.var.user` and `c.var.session`
- `requirePermission` (`common/middleware/permission.middleware.ts`): 401 signed out, 403 without the permission
- `GET /api/config/captcha`: public captcha config from `AuthService.captchaPublicConfig`
- `/api/healthz`: `hibp` and `captcha` Provider Health
- The web app, through the Better Auth Svelte client and the `/api` proxy

## Integration Patterns

### Mounting (`application.controller.ts`)
```typescript
// Better Auth owns /api/auth/* and is registered before the session middleware and every other
// route, outside the api-contract RPC types.
api.on(['GET', 'POST'], `${AUTH_ROUTE}/*`, (c) => this.authService.auth.handler(c.req.raw));

const app = api.use(authSession(this.authService)).route('/', this.routes()) /* ... */;
```

### Session middleware (`common/middleware/auth-session.middleware.ts`)
```typescript
const result = await authService.auth.api.getSession({ headers: c.req.raw.headers });
c.set('user', result?.user ?? null);
c.set('session', result?.session ?? null);
```

### Lazy instance (`auth/auth.service.ts`)
`AuthService.auth` builds the Better Auth instance on first use from env, so importing the module
opens no connection.

## Error Propagation

- Better Auth answers its own errors (status plus a `code` such as `INVALID_EMAIL_OR_PASSWORD`,
  `PASSWORD_COMPROMISED`, `PASSWORD_CHECK_UNAVAILABLE`); a throttled request is `429` with `X-Retry-After`.
- Our routes throw `Unauthorized` / `Forbidden` from `common/utils/exceptions.ts`, handled by the
  shared `onError` middleware.

## Related Documentation

- [Overview](./overview.md)
- [Business Processes](./business-processes.md)
- [Data Model](./data-model.md)
