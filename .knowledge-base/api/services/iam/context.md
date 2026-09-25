# IAM Service Context

## Service Boundaries

### What IAM Owns
- Password and email-code login (`POST /login`, `POST /login/request`, `POST /login/verify`)
- Logout (`POST /logout`)
- Password reset request/verify/complete
- Session lifecycle (create, validate/extend, invalidate) via `SessionsService`/`SessionsRepository`

### What IAM Does NOT Own
- Current-user profile (`GET /api/users/me`, `PATCH /api/users/me`) — owned by the Users service
  (`UsersController`)
- Credential/user persistence — owned by the Users service (`UsersRepository`,
  `CredentialsRepository`, `UsersService`)
- MFA (TOTP/recovery codes) — a separate module exists under
  `apps/api/src/lib/server/api/mfa/` (see the MFA service docs), but it is not wired into any IAM
  route; IAM does not check or enforce MFA today
- Roles/permissions — `roles` module, not IAM
- There is no Audit service/module anywhere in `apps/api/src`; nothing in this repo logs
  authentication events to a dedicated audit trail

## Service Dependencies

### Upstream Dependencies (IAM depends on)

#### Users service (`UsersRepository`, `CredentialsRepository`, `UsersService`)
- **Purpose**: user lookup by identifier/email, password-credential lookup, password updates,
  new-user creation on first email-code login
- **Failure Impact**: cannot authenticate or reset passwords
- **Fallback**: none — critical dependency

#### Redis Service
- **Purpose**: session storage (`SessionsRepository`), rate limiting (`rateLimit` middleware),
  and short-lived login/reset verification codes (`LoginRequestsRepository`,
  `ResetPasswordRequestsRepository`)
- **Failure Impact**: cannot create/validate sessions, cannot rate-limit, cannot complete
  login/reset code flows
- **Fallback**: none — critical dependency

#### Mailer Service (`MailerService` → dev/prod mailer)
- **Purpose**: deliver login verification codes, password-reset codes, and welcome emails
- **Usage**: `LoginRequestsService` and `ResetPasswordRequestsService` call `mailer.send(...)`
  and do not catch mailer errors — a mailer failure surfaces as a request failure
- **Note**: in `dev`, this posts to a local Mailpit-compatible endpoint; in `prod`, `ProdMailerService`
  only `console.log`s and does not actually send mail (see [Dependencies](./dependencies.md))

### Downstream Dependencies (services that depend on IAM)

#### `sessionManagement` middleware (used by every request)
- **Purpose**: resolve `c.var.session` for the whole app
- **Usage**: reads the session cookie, calls `SessionsService.validateSession`, sets
  `c.set('session', ...)`

#### `authState('session')` / `authState('none')` middleware
- **Purpose**: gate individual routes on the presence/absence of `c.var.session`
- **Usage**: throws `Unauthorized` when the required state doesn't match

#### Users service
- **Purpose**: `GET /api/users/me` reads `c.var.session.userId` to look up the current user
- **Integration**: depends on `sessionManagement` populating the session, not on IAM routes
  directly

## Integration Patterns

### Session Validation Middleware (actual code)
```typescript
// apps/api/src/lib/server/api/common/middleware/session-managment.middleware.ts
export const sessionManagement: MiddlewareHandler = createMiddleware(async (c, next) => {
  const sessionId = await sessionService.getSessionCookie();
  if (!sessionId) {
    c.set('session', null);
    return next();
  }
  const session = await sessionService.validateSession(sessionId);
  if (!session) sessionService.deleteSessionCookie();
  if (session?.fresh) sessionService.setSessionCookie(session);
  c.set('session', session);
  return next();
});
```

### Auth State Gate (actual code)
```typescript
// apps/api/src/lib/server/api/common/middleware/auth.middleware.ts
const authed: MiddlewareHandler = createMiddleware(async (c, next) => {
  if (!c.var.session) throw Unauthorized(m.auth_login_required());
  return next();
});
```

There is no MFA-check step, no audit-logging call, and no `requiresMfa`/`tempToken` branch
anywhere in this code path.

## Data Flow

### Password Login
```
Client → IamController → UsersRepository (identifier lookup)
                       → CredentialsRepository (password credential lookup)
                       → HashingService/argon2 (verify)
                       → SessionsRepository via Redis (create session)
                       → Client (signed session cookie)
```

### Email-Code Login
```
Client → IamController → LoginRequestsRepository via Redis (store/verify code)
                       → MailerService (send code)
                       → UsersService (create user, if new)
                       → SessionsRepository via Redis (create session)
                       → Client (signed session cookie)
```

### Password Reset
```
Client → IamController → UsersRepository (lookup)
                       → ResetPasswordRequestsRepository via Redis (store/verify code)
                       → MailerService (send code)
                       → UsersService.updatePassword (Argon2 hash + credential upsert)
                       → Client (success message)
```

## State Management

### Session State (Redis, `SessionsRepository`)
```typescript
{
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date; // 30 days from creation/extension
}
```

### Login/Reset Request State (Redis)
```typescript
{
  email: string;
  hashedCode: string; // Argon2 hash of the emailed verification code
}
```

## Error Propagation

- Domain errors are thrown via `BadRequest`/`Unauthorized`/`NotFound` helpers
  (`common/utils/exceptions.ts`) and handled by the shared `onError` middleware
  (`application.controller.ts`) — there is no custom per-route error mapping in IAM.
- Redis/DB connectivity failures propagate as unhandled exceptions to the same `onError` handler;
  there is no bespoke circuit breaker or fallback in this module.

## Related Documentation

- [Overview](./overview.md)
- [API Documentation](./api-doc.md)
- [Business Processes](./business-processes.md)
- [Dependencies](./dependencies.md)
