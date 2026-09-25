# MFA (Multi-Factor Authentication) Service

## Purpose

Provides multi-factor authentication capabilities including TOTP, passkeys, security keys, and recovery codes for enhanced account security.

## Responsibilities

- TOTP (Time-based One-Time Password) enrollment and verification
- Passkey (WebAuthn) registration and authentication
- Security key (FIDO2) management
- Recovery code generation and validation
- MFA method management per user

## Key Concepts

### TOTP (Google Authenticator, Authy)
Time-based one-time passwords using HMAC-based algorithm with 30-second windows.

### Passkeys (WebAuthn)
Passwordless authentication using public key cryptography and device biometrics.

### Security Keys (YubiKey)
Hardware-based authentication tokens for phishing-resistant authentication.

### Recovery Codes
Backup codes for account recovery when primary MFA methods unavailable.

## Technology Stack

- **Framework**: Hono
- **TOTP**: `otpauth` library
- **WebAuthn**: `@simplewebauthn/server`
- **Database**: PostgreSQL via Drizzle ORM
- **Validation**: Zod schemas

## Core Features

- TOTP enrollment with QR code generation
- Passkey registration and authentication
- Security key registration
- Recovery code generation (one-time use)
- MFA method listing and removal
- Backup method enforcement

## Security Considerations

- TOTP secrets encrypted at rest
- Recovery codes hashed (bcrypt)
- Rate limiting on verification attempts
- Require at least one backup method
- Audit logging for all MFA events

## Dependencies

### Internal
- IAM service (authentication integration)
- Audit service (event logging)
- Database service (credential storage)

### External
- `otpauth` - TOTP generation
- `@simplewebauthn/server` - WebAuthn support
- `qrcode` - QR code generation

## Integration Points

- **IAM Service**: MFA verification during login
- **User Service**: MFA status in user profile
- **Audit Service**: MFA enrollment and usage logging

## Related Documentation

- [API Index](../../index.md)
