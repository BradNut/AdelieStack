---
status: accepted
---

# Admin capabilities require a Second Factor

Two-factor was optional for every role, so one guessed or phished password gave full admin rights (NIST IA-2(1), AC-6; issue #231). Admin capabilities now need the account to have a Second Factor: two-factor enabled, or at least one registered passkey. The check guards the capabilities, not sign-in, so an admin without one can still sign in and enrol. Which roles it covers is `SECOND_FACTOR_ROLES` in `packages/shared` (today only `admin`).

- **Admin plugin endpoints** (`/api/auth/admin/*`): `secondFactorGuard` (`auth.second-factor.ts`) refuses a signed-in admin without a Second Factor with `403 SECOND_FACTOR_REQUIRED`. It reads the stored role unnarrowed, as the admin plugin authorises with it. `has-permission` and `stop-impersonating` are exempt: they exercise no admin capability. A call without a session (the seed, server-side checks) is untouched.
- **Our permission-guarded routes**: `requirePermission` answers `403` with `code: SECOND_FACTOR_REQUIRED` when only roles that need a Second Factor grant the permission and the account has none. A role that grants it on its own is not held to the rule.
- **Web**: `/users/me` reports `needsSecondFactor`. A route gated to admin sends such a user to two-factor enrolment (which links to passkeys) with a flash message, not a 403 page. A client call refused with the code does the same.
- **Removing the last Second Factor**: refused for an admin, with `400 LAST_SECOND_FACTOR`. Disabling two-factor needs a passkey left, and deleting the only passkey needs two-factor on. Other roles may remove theirs.

## Consequences

- An enrolled admin can never fall back to a password-only account by their own action. To drop a factor they first add the other one; an account that must lose both is demoted first (or the user is deleted).
- Until an admin enrols, anyone with their password can sign in and enrol a factor of their own, then hold admin rights. This is the price of letting a new admin reach enrolment without a separate channel. Seed admins with a strong, unshared `ADMIN_PASSWORD` and enrol straight away (the seeded admin's first-run path is in the database migrations runbook).
- The Second Factor counts whatever the session's own sign-in used: a password-only session gains admin capabilities as soon as the account enrols, without signing in again. Enrolling two-factor already needs the password and a fresh session.
- Each guarded admin request reads the user's passkeys when two-factor is off: one indexed query.
- Better Auth owns the endpoints ([ADR 0009](./0009-better-auth-owns-the-auth-core.md)); the guard is a before hook on its paths (`AuthEndpoint`), so an upgrade that renames them breaks the API tests, which is where it is caught.

## Considered options

- Require the Second Factor at sign-in for admins: rejected. A new or seeded admin could never sign in to enrol.
- Count only TOTP: rejected. A passkey proves possession plus a PIN or biometric ([ADR 0008](./0008-two-factor-reauthentication-requires-every-factor.md)), which is at least as strong.
- Allow removing the last factor and let enforcement refuse admin capabilities afterwards: rejected. It reopens the password-only window above for an account that had closed it.
- Demote the admin automatically when they remove the last factor: rejected. A silent role change is surprising and leaves no admin on a single-admin install.
