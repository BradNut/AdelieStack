---
status: accepted
---

# Admin capabilities require a Second Factor

Two-factor was optional for every role, so one guessed or phished password gave full admin rights (NIST IA-2(1), AC-6; issue #231). Admin capabilities now need the account to have a Second Factor: two-factor enabled, or at least one registered passkey. The check guards the capabilities, not sign-in, so an admin without one can still sign in and enrol. Which roles it covers is `SECOND_FACTOR_ROLES` in `packages/shared` (today only `admin`).

- **Admin plugin endpoints** (`/api/auth/admin/*`): `secondFactorGuard` (`auth.second-factor.ts`) refuses a signed-in admin without a Second Factor with `403 SECOND_FACTOR_REQUIRED`. It reads the stored role unnarrowed, as the admin plugin authorises with it. `has-permission` and `stop-impersonating` are exempt: they exercise no admin capability. A call without a session (the seed, server-side checks) is untouched.
- **Our permission-guarded routes**: `requirePermission` answers `403` with `code: SECOND_FACTOR_REQUIRED` when only roles that need a Second Factor grant the permission and the account has none. A role that grants it on its own is not held to the rule. The code goes out through `CodedHTTPException`, the one narrow exception to the status-only error body in the [error-handling standard](../../.knowledge-base/api/standards/error-handling.md): this `403` must be told apart from any other so the web app can send the admin to enrolment.
- **Which roles each surface checks**: each check reads the roles its surface authorises with, so the two differ on purpose for a multi-valued stored role. The admin plugin authorises with the stored value unnarrowed (a stored `user,admin` acts as admin there even while `ALLOW_MULTIPLE_ROLES` is off), so its guard does too, and holds any stored admin to the rule on every admin endpoint, since it cannot tell which role grants a given one. `requirePermission` authorises with the narrowed roles (`rolesOf`), so it checks only the narrowed roles that grant the permission. Reading the narrowed roles in the plugin guard would let a stored `user,admin` without a factor use the plugin's admin endpoints; reading the stored value in `requirePermission` would refuse a role our routes do not grant.
- **Writing a Second Factor through the admin plugin**: refused with `400 SECOND_FACTOR_NOT_WRITABLE`, for any caller and value. `/admin/create-user` and `/admin/update-user` copy `data` to the user row unchecked, so without this an admin could mark an account (their own or another admin's) `twoFactorEnabled` with no factor behind it, or clear another admin's. Only the owner enrols or removes a factor; an account that must lose one is demoted or deleted instead.
- **Web**: `/users/me` reports `needsSecondFactor`. A route gated to admin sends such a user to two-factor enrolment (which links to passkeys) with a flash message, not a 403 page. A client call refused with the code does the same.
- **Removing the last Second Factor**: refused for an admin, with `400 LAST_SECOND_FACTOR`. Disabling two-factor needs a passkey left, and deleting the only passkey needs two-factor on. Other roles may remove theirs.

## Consequences

- An enrolled admin can never fall back to a password-only account by their own action (bar the concurrent-removal race below, which leaves them refused, not password-only). To drop a factor they first add the other one; an account that must lose both is demoted first (or the user is deleted).
- Until an admin enrols, anyone with their password can sign in and enrol a factor of their own, then hold admin rights. This is the price of letting a new admin reach enrolment without a separate channel. Seed admins with a strong, unshared `ADMIN_PASSWORD` and enrol straight away (the seeded admin's first-run path is in the database migrations runbook).
- The Second Factor counts whatever the session's own sign-in used: a password-only session gains admin capabilities as soon as the account enrols, without signing in again. Enrolling two-factor already needs the password and a fresh session.
- The last-factor check is a read before Better Auth's own delete, not one transaction with it. Two removals sent at once (two `delete-passkey` calls, or `disable` and `delete-passkey`) can each see the other factor still there, and leave the admin with none. Closing it would mean holding a per-user lock across Better Auth's handler, which a before hook cannot do without taking over the endpoint. The race needs the admin's own session and fails closed: the account then has no Second Factor, so its admin capabilities are refused until it enrols again; it never gains a password-only admin.
- Each guarded admin request reads the user's passkeys when two-factor is off: one indexed query.
- Better Auth owns the endpoints ([ADR 0009](./0009-better-auth-owns-the-auth-core.md)); the guard is a before hook on its paths (`AuthEndpoint`), so an upgrade that renames them breaks the API tests, which is where it is caught.

## Considered options

- Require the Second Factor at sign-in for admins: rejected. A new or seeded admin could never sign in to enrol.
- Count only TOTP: rejected. A passkey proves possession plus a PIN or biometric ([ADR 0008](./0008-two-factor-reauthentication-requires-every-factor.md)), which is at least as strong.
- Allow removing the last factor and let enforcement refuse admin capabilities afterwards: rejected. It reopens the password-only window above for an account that had closed it.
- Demote the admin automatically when they remove the last factor: rejected. A silent role change is surprising and leaves no admin on a single-admin install.
