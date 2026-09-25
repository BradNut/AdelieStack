# IAM (Identity & Access Management) Service

## Purpose

The IAM service owns email/password authentication, email-code login and password reset,
and Redis-backed session lifecycle for the AdelieStack API (`@adelie/api`). It does not own
user registration, profile management beyond session-derived identity, MFA, or roles/permissions.

## Responsibilities

- Password login (`POST /login`)
- Passwordless email-code login request/verify (`POST /login/request`, `POST /login/verify`)
- Logout (`POST /logout`)
- Password reset request/verify/complete (`POST /password/reset/request`,
  `POST /password/reset/verify`, `POST /password/reset`)
- Session creation, validation, extension, and invalidation (Redis-backed)

`GET /api/users/me` (current-user profile) is owned by the Users service, not IAM.

## Key Concepts

### Password Login Flow
1. Client submits `identifier` (username or email) and `password` to `POST /login`.
2. `LoginRequestsService.login` looks up the user, loads their `PASSWORD` credential, and
   verifies it with `HashingService` (Argon2).
3. On success, `SessionsService.createSession` writes a session to Redis and the controller
   sets a signed session cookie.

### Email-Code Login Flow
1. Client posts an email to `POST /login/request`; `LoginRequestsService.sendVerificationCode`
   generates a 6-character code, hashes it, stores it in Redis via `LoginRequestsRepository`,
   and emails it with `MailerService`.
2. Client posts the email + code to `POST /login/verify`; on a valid code the existing user is
   logged in, or a new user is created (`UsersService.createEmail`) and logged in — this is the
   only signup path reachable through IAM routes.

### Session Management
- Sessions are stored in Redis (`SessionsRepository`, keyed by session id) with a TTL derived
  from `expiresAt`.
- `SessionsService.validateSession` extends (re-persists) a session when fewer than 15 days of
  its 30-day lifetime remain ("fresh" sessions get their cookie re-set).
- The session cookie is a signed cookie (`hono/cookie`) named `session`, `httpOnly`, `sameSite: lax`,
  and `secure` only when `ENV === 'prod'`.

## Technology Stack

- **Framework**: Hono, via `IamController` (`Controller` factory) mounted at `/api/iam`
- **Session Store**: Redis (`ioredis`, via `RedisRepository`)
- **Password Hashing**: Argon2 (`argon2` package, wrapped by `HashingService`)
- **Validation**: Zod schemas from `@adelie/shared` (`zValidator` / `@hono/zod-validator`)
- **Database**: PostgreSQL via Drizzle ORM (`users_table`, `credentials_table`)

## Service Structure

```
apps/api/src/lib/server/api/iam/
├── iam.controller.ts                 # mounts /api/iam routes
├── login-requests/
│   ├── login-requests.repository.ts  # Redis-backed login-code storage
│   ├── login-requests.service.ts     # password + email-code login logic
│   └── routes/login.routes.ts        # OpenAPI operation for POST /login
├── reset-password-requests/
│   ├── reset-password-requests.repository.ts
│   └── reset-password-requests.service.ts
└── sessions/
    ├── sessions.repository.ts        # Redis-backed session storage
    ├── sessions.service.ts           # cookie + session lifecycle
    └── dtos/                         # create-session-dto, session.dto
```

There are no passkey, WebAuthn, 2FA/MFA, auth-step, or audit modules under `iam/`.

## Security Considerations

- Passwords hashed with Argon2 (`argon2` npm package), not bcrypt.
- Sessions stored in Redis with a TTL matching `expiresAt`.
- `POST /login` is rate-limited (3 requests/minute, keyed by session user or `x-forwarded-for` +
  route) via `rateLimit` middleware (`hono-rate-limiter` + `rate-limit-redis`).
- Session cookies are signed, `httpOnly`, `sameSite: lax`, and `secure` in production.
- No account lockout, CSRF token, or audit-logging mechanism exists in this module.

## Dependencies

### Internal
- `@adelie/shared` - Zod DTOs (`signinDto`, `createLoginRequestDto`, etc.) and `StatusCodes`
- `UsersRepository` / `UsersService` / `CredentialsRepository` (Users service) - credential and
  user lookups
- `RedisService` (session storage, rate limiting)
- `MailerService` (login-code and reset-code emails)

### External
- `argon2` - password hashing
- `ioredis` (via `RedisRepository`) - Redis client
- `zod` - input validation
- `hono`, `hono-rate-limiter`, `rate-limit-redis` - web framework and rate limiting

## Related Documentation

- [API Documentation](./api-doc.md)
- [Business Processes](./business-processes.md)
- [Context](./context.md)
- [Data Model](./data-model.md)
- [Dependencies](./dependencies.md)
- [Runbook](./runbook.md)
