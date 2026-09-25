# IAM Business Processes

These flows describe the real implementation in
`apps/api/src/lib/server/api/iam/{login-requests,reset-password-requests,sessions}`.

## Password Login (`POST /login`)

```
1. Client submits { identifier, password }
   ↓
2. zValidator validates against signinDto
   ↓
3. Rate limit check (3/min, Redis-backed)
   ↓
4. UsersRepository.findOneByEmailOrUsername(identifier)
   ├─ Not found → BadRequest('Invalid credentials')
   └─ Found → continue
   ↓
5. CredentialsRepository.findPasswordCredentialsByUserId(userId)
   ├─ Not found → BadRequest('Invalid credentials')
   └─ Found → continue
   ↓
6. HashingService.compare(password, credential.secret_data) (Argon2)
   ├─ Invalid → BadRequest('Invalid credentials')
   └─ Valid → continue
   ↓
7. SessionsService.createSession(userId) — writes session to Redis
   ↓
8. Controller sets signed session cookie
   ↓
9. Return { message: 'welcome' }
```

There is no MFA branch, account lockout, or audit-log step in this flow.

## Email-Code Login Request (`POST /login/request`)

```
1. Client submits { email }
   ↓
2. LoginRequestsRepository.delete(email) — clear any prior pending request
   ↓
3. VerificationCodesService generates a 6-char code + Argon2 hash
   ↓
4. LoginRequestsRepository.set({ email, hashedCode }) — stored in Redis
   ↓
5. MailerService.send(LoginVerificationEmail) with the plaintext code
   ↓
6. Return { message: 'welcome' }
```

## Email-Code Login Verify (`POST /login/verify`)

```
1. Client submits { email, code }
   ↓
2. LoginRequestsRepository.get(email)
   ├─ Not found → BadRequest('Invalid code')
   └─ Found → continue
   ↓
3. VerificationCodesService.verify(code, storedHash) (Argon2 compare)
   ├─ Invalid → BadRequest('Invalid code')
   └─ Valid → continue
   ↓
4. LoginRequestsRepository.delete(email) — burn the one-time request
   ↓
5. UsersRepository.findOneByEmail(email)
   ├─ Found → SessionsService.createSession(existingUser.id)
   └─ Not found → UsersService.createEmail(email), send WelcomeEmail,
                  SessionsService.createSession(newUser.id)
   ↓
6. Controller sets signed session cookie; return { message: 'welcome' }
```

## Password Reset Request (`POST /password/reset/request`)

```
1. Client submits { email }
   ↓
2. UsersRepository.findOneByEmail(email)
   ├─ Not found → return silently (no error, no email — prevents enumeration)
   └─ Found → continue
   ↓
3. ResetPasswordRequestsRepository.delete(email) — clear any prior request
   ↓
4. VerificationCodesService generates a code + Argon2 hash
   ↓
5. ResetPasswordRequestsRepository.set({ email, hashedCode }) — stored in Redis
   ↓
6. MailerService.send(ResetPasswordEmail) with the plaintext code
   ↓
7. Return { message: 'success' }
```

## Password Reset Verify (`POST /password/reset/verify`)

```
1. Client submits { email, code }
   ↓
2. ResetPasswordRequestsRepository.get(email)
   ├─ Not found → BadRequest('Invalid code')
   └─ Found → continue
   ↓
3. VerificationCodesService.verify(code, storedHash)
   ├─ Invalid → BadRequest('Invalid code')
   └─ Valid → continue
   ↓
4. ResetPasswordRequestsRepository.delete(email)
   ↓
5. UsersRepository.findOneByEmail(email)
   ├─ Not found → BadRequest('Unable to reset password')
   └─ Found → return true
   ↓
6. Return { message: 'success' }
```

## Password Reset Completion (`POST /password/reset`)

```
1. Client submits { email, password, confirm_password }
   ↓
2. resetPasswordNewPasswordDto.superRefine checks password === confirm_password
   ├─ Mismatch → BadRequest('Passwords do not match')
   └─ Match → continue
   ↓
3. UsersRepository.findOneByEmail(email)
   ├─ Not found → BadRequest('Unable to reset password')
   └─ Found → continue
   ↓
4. UsersService.updatePassword(userId, password) — hashes with Argon2, upserts credential
   ↓
5. Return { message: 'welcome' }
```

Note: this handler does not itself re-verify that a reset code was previously confirmed, nor does
it revoke existing sessions for the user — there is no session-revocation step in this flow.

## Logout (`POST /logout`)

```
1. Client calls POST /logout (no body)
   ↓
2. SessionsService.invalidateSession('') — deletes a session by id in Redis
   ↓
3. SessionsService.deleteSessionCookie() — clears the cookie regardless
   ↓
4. Return { message: 'logout' }
```

## Session Validation (every request, `sessionManagement` middleware)

```
1. Read signed "session" cookie → session id
   ↓
2. No cookie → c.set('session', null), continue
   ↓
3. SessionsRepository.get(sessionId) via Redis
   ├─ Not found → deleteSessionCookie(), c.set('session', null)
   └─ Found → check expiry
      ├─ Expired → delete from Redis, treat as not found
      └─ Valid, <15 days remaining → re-persist with new 30-day expiry, re-set cookie ("fresh")
   ↓
4. c.set('session', session | null)
   ↓
5. Routes using authState('session') throw Unauthorized if session is null;
   routes using authState('none') throw Unauthorized if session is present
```

## Business Rules (as implemented)

- Password field has no server-side minimum-length or complexity rule beyond "non-empty"
  (`signinDto`); `resetPasswordNewPasswordDto` only requires non-empty + matching confirmation.
- Verification codes are 6 characters drawn from a look-alike-free alphabet
  (`23456789ACDEFGHJKLMNPQRSTUVWXYZ`), hashed with Argon2 before storage.
- Sessions default to a 30-day expiry and are extended (not rotated) when fewer than 15 days
  remain.
- `POST /login` is the only endpoint with a rate limit (3/min); the other IAM endpoints have none.
- There is no account lockout, no audit logging, and no MFA gate in any of these flows.

## Related Documentation

- [Overview](./overview.md)
- [API Documentation](./api-doc.md)
- [Data Model](./data-model.md)
- [Runbook](./runbook.md)
