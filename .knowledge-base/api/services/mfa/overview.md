# MFA (Multi-Factor Authentication) Service

## Purpose

Second factors and passkeys. There is no MFA module of our own: Better Auth's `twoFactor` and `passkey` plugins provide both, configured in `apps/api/src/lib/server/api/auth/auth.config.ts` and mounted with the rest of Better Auth at `/api/auth/*` ([ADR 0009](../../../../docs/adr/0009-better-auth-owns-the-auth-core.md)).

## Second Factors (`twoFactor` plugin)

- **Methods**: TOTP (authenticator app), an emailed one-time code, and Recovery Codes (Better Auth's backup codes).
- **Enrolment**: confirmed with a first valid TOTP code. TOTP secrets and Recovery Codes are encrypted with the auth secret.
- **Emailed codes**: sent through the mailer with `TwoFactorOtpEmail`; valid for `TWO_FACTOR_OTP_PERIOD_MINUTES` (`packages/shared/src/constants/mfa-limits.ts`, with the code lengths).
- **Storage**: the `two_factors` table in `auth/tables/auth.table.ts`.
- **Security Events**: using a Recovery Code and regenerating them email the user (`auth/auth.mail.ts`).
- **Rate limits**: verifying a code and the password-checking two-factor endpoints use the strict rule; emailing a code uses the email rule. See the "Auth rate limiting" section of the [environment config runbook](../../runbooks/environment-config.md).

## Passkeys (`passkey` plugin)

- WebAuthn passkeys and hardware security keys. The relying party (`rpID`, `rpName`, `origin`) comes from env.
- **Storage**: the `passkeys` table in `auth/tables/auth.table.ts`.
- Passkey sign-in is never captcha-challenged ([ADR 0004](../../../../docs/adr/0004-captcha-via-better-auth-plugin.md)).

## Re-authentication

A two-factor account re-authenticates with the password plus a Second Factor, or with a passkey alone; social providers are not offered ([ADR 0008](../../../../docs/adr/0008-two-factor-reauthentication-requires-every-factor.md)).

## Tests

`auth/tests/auth.two-factor.test.ts`, `auth/tests/auth.passkey.test.ts` and `auth/tests/auth.rate-limit.test.ts`.

## Related Documentation

- [API Index](../../index.md)
- [API Glossary](../../glossary.md)
