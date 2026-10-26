# IAM Business Processes

Better Auth implements these flows; the paths are below `/api/auth`. Every request first passes
Better Auth's rate limiter, then the captcha check on protected paths when captcha is on, then our
before-hooks (password policy, role guard). Our after-hooks send Security Event emails
(`auth/auth.mail.ts`) and end the Replaced Session on sign-in (`auth/auth.replaced-session.ts`).

## Sign-up (`POST /sign-up/email`)

```
1. Client submits { name, email, password }
   ↓
2. SIGN_UP_ENABLED off → refused (every sign-up method honours the same gate)
   ↓
3. Password policy: length limits, no leading or trailing space, HIBP screening
   ├─ Breached → 400 PASSWORD_COMPROMISED
   └─ HIBP unreachable → 503 PASSWORD_CHECK_UNAVAILABLE
   ↓
4. User and credential account rows inserted (role `user`)
   ↓
5. Verification email sent (sendOnSignUp); session created and cookie set
```

## Sign-in (`POST /sign-in/email`)

```
1. Client submits { email, password }  (strict rate limit)
   ↓
2. Wrong email or password → 401 (same answer for both)
   ↓
3. Two-factor enabled?
   ├─ Yes → { twoFactorRedirect: true } and a challenge cookie; no session yet.
   │        Client completes the Two-factor Challenge (/two-factor/verify-totp,
   │        /verify-otp or /verify-backup-code) to get the session.
   └─ No  → session row inserted, cookie set
```

A sign-in or sign-up from a browser that already held a session ends that Replaced Session
(`auth/auth.replaced-session.ts`), at the password step when a Two-factor Challenge follows. A
failed sign-in ends nothing, and the user's sessions on other devices are untouched.

Passkey sign-in (`/passkey/*`) and social sign-in (`/sign-in/social`, then the provider callback)
create a session without the password step. Social sign-in links to an existing account only when
both sides report the email as verified.

## Email Verification

```
1. Link emailed on sign-up, or on request (POST /send-verification-email, email rate limit)
   ↓
2. GET /verify-email?token=... consumes the token; expired tokens are rejected
   ↓
3. users.email_verified = true
```

Signed out, an unknown or already-verified address gets the same success answer and no email.
Signed in with an already-verified email, the request is a `400 EMAIL_ALREADY_VERIFIED`.

## Password Reset

```
1. POST /request-password-reset { email, redirectTo }  (email rate limit)
   ├─ Unknown email → same success answer, no email (prevents enumeration)
   └─ Known → reset link emailed (PasswordResetLinkEmail)
   ↓
2. Link opens the web reset page with a token
   ↓
3. POST /reset-password { token, newPassword }  (own rate limit, password policy)
   ↓
4. Password updated; "password changed" Security Event email sent
```

Existing sessions are **not** revoked by a reset (`revokeSessionsOnPasswordReset` is not set).

## Password Change (`POST /change-password`)

Needs the current password. Optionally revokes other sessions (`revokeOtherSessions`). Sends the
"password changed" Security Event email.

## Sessions

```
Every request to our own routes:
  authSession middleware → auth.api.getSession(headers)
    ├─ No or expired session → c.var.user = c.var.session = null
    └─ Valid → c.var.user, c.var.session set; Better Auth extends the
               expiry (at most once a day) and re-sets the cookie
```

Sign-out deletes the session row and clears the cookie. Users can list and revoke their own
sessions; admins can list and revoke anyone's (`/admin/list-user-sessions`, `/admin/revoke-user-sessions`).

## Fresh Session Gate

Sensitive actions (delete user, change email, unlink an account, list sessions, ...) refuse a session
older than `AUTH_SESSION_FRESH_AGE` (5 minutes). The web re-authenticates in a dialog and retries;
see ADRs [0007](../../../../docs/adr/0007-social-reauthentication-replays-a-persisted-action.md) and
[0008](../../../../docs/adr/0008-two-factor-reauthentication-requires-every-factor.md).

## Authorization (our routes)

```
requirePermission(authService, rolesService, { user: ['list'] })
  ├─ Signed out → 401
  ├─ No role of the user grants it (auth.api.userHasPermission) → 403
  └─ Granted → handler
```

## Business Rules

- Sign-up is closed unless `SIGN_UP_ENABLED` is true.
- Sign-in does not require a verified email.
- A user has one role unless `ALLOW_MULTIPLE_ROLES` is on; empty or unknown stored roles read as the
  least-privileged role.
- The last remaining sign-in method cannot be unlinked.
- Password guessing is limited per client IP by the rate limiter; there is no password lockout.
- Second-factor guessing is also limited per account: 10 failed codes lock verification for 15
  minutes (`429 ACCOUNT_TEMPORARILY_LOCKED`); a correct code resets the count.

## Related Documentation

- [Overview](./overview.md)
- [Data Model](./data-model.md)
- [Runbook](./runbook.md)
