# IAM Service Runbook

Configuration, rate limiting, captcha, HIBP and social login are covered in the
[environment config runbook](../../runbooks/environment-config.md). This page covers user and
session operations.

## Common Operations

### Investigate a User's Sign-in Failures

**Scenario:** A user reports they cannot sign in.

**Steps:**
1. Check the user and how they can sign in:
   ```sql
   SELECT id, email, email_verified, role, banned, ban_reason, ban_expires, two_factor_enabled
   FROM users WHERE email = 'user@example.com';

   SELECT provider_id, created_at FROM accounts WHERE user_id = '<user_id>';  -- 'credential' = password
   SELECT name, device_type, created_at FROM passkeys WHERE user_id = '<user_id>';
   ```
   - `banned` → they are refused until unbanned (`/admin/unban-user`) or `ban_expires` passes.
   - No `credential` account → they have no password; they sign in with a social provider or a
     passkey, or set a password through password reset.
   - `two_factor_enabled` → after the password or a social provider they must complete the Two-factor Challenge.
2. If they get `429`:
   - With `X-Retry-After`: a rate limit; the header says how long to wait. Counters are in Redis
     under `auth-rate-limit:`.
   - With `ACCOUNT_TEMPORARILY_LOCKED` on a two-factor step: 10 wrong codes locked their second
     factor for 15 minutes.
     ```sql
     SELECT failed_verification_count, locked_until FROM two_factors WHERE user_id = '<user_id>';
     ```

**Resolution:** A two-factor lock clears itself at `locked_until`; there is no password lockout.
A ban is lifted through the admin endpoint.

---

### Force a Password Reset

**Scenario:** A user's password may be compromised.

**Steps:**
1. Revoke their sessions: `POST /api/auth/admin/revoke-user-sessions` with `{ userId }` as an admin.
   A password reset alone does **not** revoke existing sessions.
2. Either have the user request a reset link (`/request-password-reset`), or set a password as an
   admin (`/admin/set-user-password`; screened by the password policy and HIBP).

---

### Revoke Sessions

- **One session**: the user revokes it from settings (`/revoke-session`), or an admin calls
  `/admin/revoke-user-session` with the session token.
- **All of a user's sessions**: `/admin/revoke-user-sessions` with `{ userId }`.
- **Directly in the database** (when the API is unavailable):
  ```sql
  DELETE FROM sessions WHERE user_id = '<user_id>';
  ```
  The cookie cache is off, so a deleted row signs the user out on their next request.

---

## Troubleshooting

### Nobody Can Sign In

**Symptoms:** sign-in fails for everyone, or every request looks signed out.

**Diagnosis:**
1. `curl http://localhost:3001/api/healthz` (the API must be up).
2. Postgres: `psql "$DATABASE_URL" -c "SELECT 1;"`. Sessions are read from Postgres on every request.
3. Redis: `redis-cli -u "$REDIS_URL" ping`. With auth rate limiting on, an unreachable Redis fails
   every auth request.
4. `BETTER_AUTH_SECRET` changed → existing session cookies no longer verify and everyone is signed
   out; secrets Better Auth encrypted with it (TOTP secrets, Recovery Codes) become unreadable.
5. `BETTER_AUTH_URL` or `ORIGIN` wrong → cookies set for the wrong host, or requests refused as
   untrusted origins.

**Resolution:** restore the dependency or the env value, then restart the API. Never rotate
`BETTER_AUTH_SECRET` casually: it signs every user out and breaks enrolled two-factor.

---

### Verification, Reset or Two-factor Emails Not Arriving

**Diagnosis:**
1. `MAILER_TRANSPORT=mailpit` (the default): check Mailpit at `http://localhost:8025`.
2. `MAILER_TRANSPORT=unsend`: logs hold no addresses, so find the account's id and search the logs for it as
   `userId`:
   ```sql
   SELECT id FROM users WHERE email = '<address>';
   ```
   Each attempt writes one entry: `useSend email sent`, or `useSend email failed` with `attempt` and `error`
   (`code: message`, any address shown as `[email]`). `template` names the email.
   Three failures in a row mean the send was given up on. No entry at all means nothing tried to send.
   - `users.email` holds only the account's current address, so during an email change look up whichever
     address the account has now. Confirmation for a new address missing: look up the old address and find
     `EmailChangeRequestEmail`. Notice to the old address missing: look up the new address and find
     `EmailChangeNoticeEmail`.
   - A deleted account cannot be traced by address: its row is gone, and nothing else links an address to a `userId`.
3. Link Emails (verify an address, confirm an email change, reset a password): search for
   `AUTH_LINK_EMAIL_FAILED`. The entry is written at error level and names the template, so it shows which flow
   is losing mail. It holds no address, link or provider error; the per-attempt entries above have the `userId` and
   the redacted error.
4. Too many requests from one client → `429` on the email endpoints (3 per 5 minutes per IP).

**What the user sees when a send is given up on:**
- **Success, and no email, with one `AUTH_LINK_EMAIL_FAILED` entry**: Link Emails, which leave the request so that
  neither the response nor its timing shows which addresses have accounts.
  - Sign-up and verification resend (signed out or signed in): `EmailVerificationEmail`.
  - Email change request: `EmailChangeRequestEmail`.
  - Password reset request: `PasswordResetLinkEmail`.

  The user can request the email again. The response is no sign of delivery.
- **Success, and no email**: emailing a two-factor code. Better Auth absorbs the failure and logs it through its
  own logger (`Failed to send two-factor OTP`).
- **Success, with one `SECURITY_EVENT_EMAIL_FAILED` error entry**: Security Events (password changed,
  recovery code used or regenerated, the notice to the old address), whose change has already committed.
  The entry names the email's subject, never the address.

A restart can lose an in-flight Link Email with nothing logged: the send is held only in memory, so the absence of
an `AUTH_LINK_EMAIL_FAILED` entry does not prove it was delivered. The user can request it again.

**Resolution:**
- Dev: restart Mailpit and retry.
- Prod: act on the logged `error`. A refused key or sender: fix `USESEND_API_KEY`, or put `MAIL_FROM`
  on a domain verified in useSend, then restart. `fetch failed` or a server error: check
  `USESEND_BASE_URL` (the server's address only, see
  [Environment Configuration](../../runbooks/environment-config.md#email)) and useSend's status.
  If the logs say `useSend email sent` and it still did not arrive, check useSend's dashboard.

---

### Sessions Ending Unexpectedly

**Diagnosis:**
1. A session lasts 7 days after its last refresh and is refreshed at most once a day of activity, so
   a week without a request signs the user out.
2. Check whether the row still exists:
   ```sql
   SELECT id, expires_at, updated_at FROM sessions WHERE user_id = '<user_id>';
   ```
   A missing row means sign-out, revocation (user or admin), a ban or account deletion.
3. A changed `BETTER_AUTH_SECRET` signs everyone out at once.

---

## Health Checks

```bash
curl http://localhost:3001/api/healthz
# { "status": "ok", "hibp": "available|unavailable|unknown|disabled", "captcha": "..." }
```

`hibp` and `captcha` report the last provider call, never a new one; see the environment config runbook.

## Related Documentation

- [Overview](./overview.md)
- [Context](./context.md)
- [Data Model](./data-model.md)
