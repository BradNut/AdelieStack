# IAM Service Runbook

## Common Operations

### Investigate a User's Login Failures

**Scenario:** User reports they cannot log in.

**Steps:**
1. Confirm the user exists and check what credential types they have:
   ```sql
   SELECT u.id, u.username, u.email, u.email_verified, u.mfa_enabled
   FROM users u
   WHERE u.email = 'user@example.com';

   SELECT id, type, created_at, updated_at
   FROM credentials
   WHERE user_id = '<user_id>';
   ```
   There are no lockout columns (`is_locked`, `locked_until`, `failed_login_attempts`) on
   `users` — do not query for them, they don't exist.

2. Check whether a session already exists for the user (sessions are keyed by session id, not
   user id, so this requires scanning):
   ```bash
   redis-cli KEYS "session:*"
   redis-cli GET "session:<session_id>"
   ```

3. Check the login rate limit for their IP (key format set by `rateLimit` middleware,
   `<clientKey>_<routePath>`):
   ```bash
   redis-cli KEYS "*_/login*"
   ```

**Resolution:** There is no unlock/reset-attempts procedure to run — no lockout mechanism exists
in this codebase. If the user has no `PASSWORD` credential row, they must use the email-code
login flow (`POST /login/request` / `POST /login/verify`) or the password-reset flow to set one.

---

### Force a Password Reset

**Scenario:** A user needs to set a new password (e.g. suspected credential compromise).

**Steps:**
1. Have the user go through the real flow: `POST /api/iam/password/reset/request` with their
   email, then `POST /api/iam/password/reset/verify` with the emailed code, then
   `POST /api/iam/password/reset` with the new password and confirmation.
2. There is no session-revocation step in `resetPassword` — existing sessions for the user are
   **not** automatically invalidated by a password reset. If sessions must be revoked, do so
   manually via Redis (see below); there is no bulk "revoke all sessions for user" endpoint or
   repository method today.

---

### Clear a Specific Session

**Scenario:** A known session id needs to be revoked immediately (e.g. reported stolen cookie).

**Steps:**
1. Delete the session key directly:
   ```bash
   redis-cli DEL "session:<session_id>"
   ```
   (This is the same effect as `SessionsService.invalidateSession`, which does not know user
   identity beyond the session id.)
2. There is no per-user session index in Redis, so finding "all sessions for user X" requires
   scanning every `session:*` key and inspecting the stored `userId` field — there is no
   supported bulk operation for this in the current code.

---

## Troubleshooting

### Users Cannot Log In (Service-Wide)

**Symptoms:** All users report login failures; 500s from `/api/iam/login`.

**Diagnosis:**
1. Check database connectivity:
   ```bash
   psql "$DATABASE_URL" -c "SELECT 1;"
   ```
2. Check Redis connectivity:
   ```bash
   redis-cli -u "$REDIS_URL" ping
   ```
3. Check the app health/rate-limit probes (the real endpoints — not a fictional `/api/health`):
   ```bash
   curl http://localhost:3001/healthz
   curl http://localhost:3001/rate-limit
   ```
4. Check application logs (pino, via `pinoLogger()` middleware) for `argon2`/Redis/Postgres
   errors.

**Resolution:**
- Database down → restart Postgres, verify `DATABASE_*` env vars.
- Redis down → restart Redis, verify `REDIS_URL`.
- `SIGNING_SECRET` missing/rotated → sessions fail to sign/verify; every request will look
  unauthenticated. Set `SIGNING_SECRET` per `apps/api/.env.schema`.

---

### Password Reset / Login Emails Not Arriving

**Symptoms:** Users report not receiving login-code or reset-code emails.

**Diagnosis:**
1. In dev, check Mailpit is running and reachable, since `DevMailerService` posts there directly:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8025/api/v1/send
   ```
   Check the Mailpit UI at `http://localhost:8025` for the message.
2. In prod, be aware that `ProdMailerService` is a stub that only `console.log`s — if this is the
   active mailer, **no email is actually sent**. Check application logs for the logged
   `Sending email to ...` line rather than expecting delivery. This is a known gap, not a bug to
   "fix" by looking for a broken SMTP connection — there's no real transport wired up yet.
3. Verify `MailerService` resolves to the intended implementation for the current `ENV`.

**Resolution:**
- Dev: restart Mailpit (`docker compose up -d mailpit` or equivalent), retry.
- Prod: a real transactional-email integration (e.g. wiring up the existing `usesend-js`
  dependency) needs to be implemented before this path can be relied on.

---

### Sessions Expiring Unexpectedly

**Symptoms:** Users logged out sooner than the expected ~30 days.

**Diagnosis:**
1. Check the session's TTL and stored `expiresAt`:
   ```bash
   redis-cli TTL "session:<session_id>"
   redis-cli GET "session:<session_id>"
   ```
2. Confirm `SIGNING_SECRET` hasn't changed — cookie signature mismatches cause
   `getSignedCookie` to return nothing, which is indistinguishable from "no session" to the
   client.
3. Check for Redis eviction under memory pressure:
   ```bash
   redis-cli INFO memory
   ```

**Resolution:**
- Redis evicting keys → increase memory / adjust eviction policy.
- `SIGNING_SECRET` rotated → expected: all existing sessions become unreadable and users must
  log in again.

---

## Health Checks

Real endpoints, from `ApplicationController` (`apps/api/src/lib/server/api/application.controller.ts`):

```bash
curl http://localhost:3001/healthz
# { "status": "ok" }

curl http://localhost:3001/rate-limit
# { "message": "Test!" }  — also exercises the shared rate-limit middleware (3/min)
```

There is no `/api/health/auth` endpoint, no per-dependency health payload, and no fictional
`secondchancepuzzles.com` domain in this codebase.

## Related Documentation

- [Overview](./overview.md)
- [API Documentation](./api-doc.md)
- [Dependencies](./dependencies.md)
- [Context](./context.md)
