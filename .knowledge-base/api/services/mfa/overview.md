# MFA (Multi-Factor Authentication) Service

## Purpose

Reserves the space for future multi-factor authentication. Today the service is **scaffolded but
stubbed**: a controller, a placeholder TOTP service, and two database tables exist, but no MFA
method can actually be enrolled or verified yet.

## Current State

- `apps/api/src/lib/server/api/mfa/mfa.controller.ts` exposes a single route, `GET /totp`, which
  always returns `501 Not Implemented` (`{ message: 'MFA not implemented' }`). The file's own
  comment says the full implementation requires services that don't exist yet (`TotpService`
  beyond the stub, a `RecoveryCodesService`, and auth middleware for MFA).
- `apps/api/src/lib/server/api/mfa/totp.service.ts` is a stub: every method either returns
  `null`/`false` or throws (`verify` always returns `false`, `findOneByUserIdOrThrow` always
  throws `'TOTP not implemented'`). Its own comment notes it requires a missing
  `EncryptionService` before secrets could be stored safely.
- Two Drizzle tables exist under `apps/api/src/lib/server/api/mfa/tables/` but nothing reads or
  writes them yet:
  - `two-factor.table.ts` (`two_factor`): `user_id`, `secret`, `enabled`.
  - `recovery-codes.table.ts` (`recovery_codes`): `user_id`, `code`, `used`.
- No passkey, WebAuthn, or security-key code exists anywhere in the API.

## Dependencies

### Real, currently unused by MFA logic

`apps/api/package.json` lists `@oslojs/otp`, `@oslojs/webauthn`, and `uqr` (QR code generation),
which look like the intended building blocks for TOTP and WebAuthn support, but no MFA code
imports or calls them today.

### Not present

`otpauth`, `@simplewebauthn/server`, and `qrcode` are not dependencies of this project and are not
used anywhere in the codebase.

## Planned (not implemented)

- TOTP enrollment/verification built on `@oslojs/otp`, using the `two_factor` table.
- Recovery codes generation/consumption built on the `recovery_codes` table.
- An `EncryptionService` to encrypt TOTP secrets at rest before `totp.service.ts` can be filled in.
- Auth middleware to gate login on a completed MFA challenge.

None of the above should be assumed to exist when reading other docs or code in this repo.

## Related Documentation

- [API Index](../../index.md)
