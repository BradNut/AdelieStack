# AdelieStack

A generic starter template for web apps. It carries the reusable application layer (identity, access, email, storage, observability) and none of any product's domain.

## Language

**Auth core**:
The part of the system that proves who a person is and what they may do. It owns users, sessions, second factors, and roles.
_Avoid_: IAM, login system

**User**:
A person with an account. A user has one or more roles.
_Avoid_: Member, customer, account

**Role**:
A named set of permissions given to a user. The roles are `admin`, `support`, and `user`.
_Avoid_: Group, level, permission set

**Session**:
One signed-in device or browser of a user. A user can list their sessions and revoke any of them.
_Avoid_: Login, token

**Second factor**:
An extra proof of identity asked at login after the password. It is a TOTP code, an emailed one-time code, or a recovery code.
_Avoid_: MFA step, 2FA token

**Recovery code**:
A single-use code that replaces a second factor when the user has lost their authenticator.
_Avoid_: Backup code, reset code

**Passkey**:
A WebAuthn credential that lets a user sign in without a password. A hardware security key is a passkey on a separate device.
_Avoid_: Biometric login, security key (as a separate concept)

**Security event**:
An account change that the user must be told about by email: password changed, recovery codes used, recovery codes regenerated.
_Avoid_: Alert, notification
