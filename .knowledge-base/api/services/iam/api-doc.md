# IAM API Documentation

All routes are defined by `IamController.routes()`
(`apps/api/src/lib/server/api/iam/iam.controller.ts`) and mounted at `/api/iam` in
`ApplicationController.registerControllers()`. Responses are plain JSON objects — there is no
`{data, error}` envelope. Validation failures from `zValidator` return Hono/Zod's standard
422 (`Unprocessable Entity`) shape; thrown domain errors (`BadRequest`, `Unauthorized`) go through
the shared `onError` handler.

## Endpoints

### POST /api/iam/login

Authenticate with an identifier (username or email) and password.

**Auth state:** `none` (must not already be logged in)
**Rate limit:** 3 requests/minute (see [Dependencies](./dependencies.md))

**Request** (`signinDto` from `@adelie/shared`):
```typescript
{
  identifier: string; // username or email, trimmed
  password: string;   // non-empty
}
```

**Response (200):**
```typescript
{ "message": "welcome" }
```
The session cookie is set as a side effect (`SessionsService.setSessionCookie`).

**Errors:** `BadRequest` ("Invalid credentials") when the identifier isn't found, no password
credential exists, or the password doesn't match.

---

### POST /api/iam/login/request

Send a one-time email verification code to start passwordless/new-account login.

**Auth state:** `none`

**Request** (`createLoginRequestDto`):
```typescript
{ email: string; } // z.string().email()
```

**Response (200):**
```typescript
{ "message": "welcome" }
```

---

### POST /api/iam/login/verify

Verify the emailed code. Logs in an existing user, or creates a new user (email-only account)
and logs them in — this is the only signup path reachable through IAM routes.

**Auth state:** `none`

**Request** (`verifyLoginRequestDto`):
```typescript
{
  email: string;
  code: string; // fixed length, VERIFICATION_CODE_LENGTH
}
```

**Response (200):**
```typescript
{ "message": "welcome" }
```

**Errors:** `BadRequest` ("Invalid code") if no pending request exists for the email or the code
doesn't match.

---

### POST /api/iam/logout

Invalidate the current session and clear the session cookie.

**Response (200):**
```typescript
{ "message": "logout" }
```

Note: the controller currently calls `invalidateSession('')` rather than the caller's actual
session id — the cookie is cleared regardless via `deleteSessionCookie()`.

---

### POST /api/iam/password/reset/request

Request a password-reset email code.

**Auth state:** `none`

**Request** (`resetPasswordEmailDto`):
```typescript
{ email: string; } // trimmed, email format, max 64 chars
```

**Response (200):**
```typescript
{ "message": "success" }
```

If no user matches the email, the service silently returns (no error, no email sent).

---

### POST /api/iam/password/reset/verify

Verify a password-reset code.

**Auth state:** `none`

**Request** (`resetPasswordCodeDto`):
```typescript
{
  email: string; // trimmed, email format
  code: string;  // trimmed, exactly 6 characters
}
```

**Response (200):**
```typescript
{ "message": "success" }
```

**Errors:** `BadRequest` ("Invalid code") or `BadRequest` ("Unable to reset password") if no user
exists for the email.

---

### POST /api/iam/password/reset

Set a new password after a verified reset.

**Auth state:** `none`

**Request** (`resetPasswordNewPasswordDto`):
```typescript
{
  email: string;            // trimmed, email format
  password: string;         // non-empty
  confirm_password: string; // must match password (superRefine)
}
```

**Response (200):**
```typescript
{ "message": "welcome" }
```

**Errors:** `BadRequest` ("Passwords do not match") or `BadRequest` ("Unable to reset password")
if no user exists for the email.

---

## Related, non-IAM endpoints

- `GET /api/users/me` — current-user profile, owned by `UsersController`, not IAM.
- `GET /healthz`, `GET /rate-limit` — top-level health/rate-limit probes on
  `ApplicationController`, not under `/api/iam`.

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `POST /api/iam/login` | 3 requests/minute, keyed by session user id (or `x-forwarded-for`) + route |
| All other IAM endpoints | none applied in `iam.controller.ts` |

## Related Documentation

- [Overview](./overview.md)
- [Business Processes](./business-processes.md)
- [Data Model](./data-model.md)
