---
status: accepted
---

# Re-authentication of a two-factor account requires every factor

The re-authentication dialog gates actions that Better Auth only allows on a fresh session, such as unlinking a sign-in account and listing sessions. OWASP ASVS 5.0 V7.5.1 asks for full re-authentication before changes that affect sign-in or account recovery, which for an account with two-factor enabled means every factor; the dialog applies one rule to every gated action rather than grading them. So a two-factor user re-authenticates with the password followed by a Two-factor Challenge (authenticator code, emailed code or recovery code) inside the dialog, or with a passkey, which on its own proves possession plus a PIN or biometric. Linked social providers are not offered to two-factor users, because provider sign-in does not trigger our challenge. This supersedes the two-factor bullet of [ADR 0007](./0007-social-reauthentication-replays-a-persisted-action.md).

That bullet feared stranding social-only two-factor users, but enrolling in two-factor requires the account password (`allowPasswordless` is not set), so every two-factor user had a password when they enrolled.

## Consequences

- A correct password on a two-factor account clears the session cookie until the challenge is completed (Better Auth deletes the new session and swaps in a challenge cookie). Closing the dialog at that point, an expired challenge or a two-factor lockout leaves the user signed out: the dialog warns before closing and then sends them to sign in again, returning to the page without replaying the action.
- The dialog never offers "trust this device": a remembered device is a risk signal, not authentication (OWASP Authentication Cheat Sheet, NIST SP 800-63B-4 §5.1).
- The emailed code is sent only when the user asks for it, so a re-authentication does not spend the email rate limit by default.
- Password sign-in callers check the `twoFactorRedirect` result themselves; the auth client has no global redirect, so a challenge raised from the dialog does not navigate away.

## Considered options

- Password alone for two-factor users: rejected. NIST 800-63B-4 allows a single factor to keep an AAL2 session alive, but ASVS V7.5.1 is the closer fit for gating account changes, and Better Auth always challenges a two-factor password sign-in.
- Code alone with the current session: rejected because Better Auth verifies a code against an existing session without creating a new one, so the session would not become fresh.
- A code step after the social provider round trip: deferred; it needs server work beyond the dialog.
