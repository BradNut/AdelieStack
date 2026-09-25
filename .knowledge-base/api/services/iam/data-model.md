# IAM Data Model

## Database Schema (PostgreSQL via Drizzle)

IAM does not define its own tables. It reads/writes the Users service's tables, re-exported via
`apps/api/src/lib/server/api/databases/postgres/drizzle-schema.ts`.

### `users_table`

`apps/api/src/lib/server/api/users/tables/users.table.ts`:

```typescript
export const users_table = pgTable('users', {
  id: id().primaryKey().$defaultFn(() => generateId()),
  username: text().unique().notNull(),
  email: citext().unique().notNull(),
  first_name: text(),
  last_name: text(),
  email_verified: boolean().default(false),
  mfa_enabled: boolean().notNull().default(false),
  avatar: text(),
  ...timestamps, // created_at, updated_at (timestamptz, not-null, default now)
});
```

- `id` is a `text` column populated by `generateId()` (not a Postgres `uuid`/`serial`).
- `email` uses a custom `citext` type (case-insensitive unique).
- There are no lockout fields (`is_active`, `is_locked`, `locked_until`,
  `failed_login_attempts`, `last_failed_login_at`, etc.) and no `name`/`password_hash` columns.
- `mfa_enabled` is a flag on the user row, but IAM itself never reads or writes it.

`publicUserColumns` (same file) excludes nothing sensitive beyond omitting relations — there is
no separate password field on this table to exclude, since passwords live in `credentials_table`.

### `credentials_table`

`apps/api/src/lib/server/api/users/tables/credentials.table.ts`:

```typescript
export enum CredentialsType {
  SECRET = 'secret',
  PASSWORD = 'password',
  TOTP = 'totp',
  HOTP = 'hotp',
}

export const credentials_table = pgTable('credentials', {
  id: id().primaryKey().$defaultFn(() => generateId()),
  user_id: id().notNull().references(() => users_table.id, { onDelete: 'cascade' }),
  type: text().notNull().default(CredentialsType.PASSWORD),
  secret_data: text().notNull(),
  ...timestamps,
});
```

- `CredentialsType` is defined **locally** in this file (a TypeScript `enum`), not imported from
  `@adelie/shared`. A similarly-named but distinct `CredentialsType` const object exists in
  `packages/shared/src/domain/credentials-type.ts` (values `PASSKEY`, `SECURITY_KEY`, `TOTP`,
  `PASSWORD`) for the MFA/passkey domain — the two are not interchangeable; IAM code
  (`credentials.repository.ts`, `users.service.ts`) imports the table-local enum.
- `secret_data` holds the Argon2 hash for `type: PASSWORD` credentials (the value IAM compares
  against in `LoginRequestsService.login`).
- One user can have multiple credential rows (one per `type`); there is no unique constraint
  tying `user_id` + `type` at the schema level, but repository methods
  (`findPasswordCredentialsByUserId`, `findTOTPCredentialsByUserId`) assume at most one per type.
- There is no passkeys table anywhere in the schema.

### Relations

```
users_table (1) ──< (N) credentials_table   (credentials_table.user_id → users_table.id, cascade delete)
users_table (1) ──< (N) user_roles_table    (not used by IAM)
```

## Redis Data Structures (IAM-owned)

### Session Storage (`SessionsRepository`, prefix `session`)

**Value** (`CreateSessionDto`, Zod-validated on read):
```typescript
{
  id: string;
  userId: string;
  createdAt: Date; // z.coerce.date()
  expiresAt: Date;
}
```
**TTL:** seconds-from-now computed as `expiresAt - now` at write time; entries with a
non-positive TTL are not written (`sessions.repository.ts`).

### Login Request Storage (`LoginRequestsRepository`, similar shape for
`ResetPasswordRequestsRepository`)

**Value:**
```typescript
{
  email: string;
  hashedCode: string; // Argon2 hash of the 6-character verification code
}
```

There is no separate "rate limit" or "account lockout" Redis structure owned by IAM — the only
rate limiting is the generic `rateLimit` middleware, backed by `rate-limit-redis`, applied to
`POST /login`.

## TypeScript DTOs (IAM-relevant, from `@adelie/shared`)

```typescript
// packages/shared/src/dtos/login/signin.dto.ts
export const signinDto = z.object({
  identifier: z.string().trim().min(MIN_USERNAME_LENGTH).max(MAX_USERNAME_LENGTH),
  password: z.string().trim().min(1),
});

// packages/shared/src/dtos/login/create-login-request.dto.ts
export const createLoginRequestDto = z.object({ email: z.string().email() });

// packages/shared/src/dtos/login/verify-login-request.dto.ts
export const verifyLoginRequestDto = z.object({
  email: z.string().email(),
  code: z.string().length(VERIFICATION_CODE_LENGTH),
});

// packages/shared/src/dtos/reset-password/reset-password-email.dto.ts
export const resetPasswordEmailDto = z.object({ email: z.string().trim().email().max(64) });

// packages/shared/src/dtos/reset-password/reset-password-token.dto.ts
export const resetPasswordCodeDto = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().min(6).max(6),
});

// packages/shared/src/dtos/reset-password/reset-password-new-password.dto.ts
export const resetPasswordNewPasswordDto = z.object({
  email: z.string().trim().email(),
  password: z.string().trim().min(1),
  confirm_password: z.string().trim().min(1),
}).superRefine(/* password === confirm_password */);
```

`SessionDto` and `CreateSessionDto` (local to `iam/sessions/dtos/`) are shown under Redis Data
Structures above.

## Data Lifecycle

### Session Lifecycle
1. **Creation**: on successful login (password or email-code) — 30-day expiry.
2. **Active**: revalidated on every request; extended (new 30-day expiry, cookie re-set) when
   fewer than 15 days remain.
3. **Expiration**: on read, an expired session is deleted from Redis and treated as absent.
4. **Revocation**: `POST /logout` deletes the session and clears the cookie. There is no
   "revoke all sessions" or multi-device session listing anywhere in this module.

### Login/Reset Request Lifecycle
1. **Creation**: `sendVerificationCode` / `sendResetPasswordCode` overwrite any prior pending
   request for the email.
2. **Consumption**: a successful `verify` call deletes the stored code immediately (single use).
3. There is no explicit TTL set on these Redis keys in the reviewed code — they persist until
   overwritten or explicitly deleted.

## Data Security

- Passwords are never stored in plaintext; `secret_data` on `credentials_table` holds an Argon2
  hash produced by `HashingService`.
- Session ids are opaque, generated by `generateId()`, and only ever transmitted inside a signed,
  `httpOnly` cookie.
- Verification codes are hashed with Argon2 before being persisted to Redis; the plaintext code
  is only ever sent by email.

## Migration Considerations

- Use Drizzle migrations (`drizzle-kit generate`); never hand-edit migration SQL or
  `drizzle/meta/**`.
- `users_table` and `credentials_table` are owned by the Users service — schema changes there
  should go through that service's docs/tests, not IAM's.

## Related Documentation

- [Overview](./overview.md)
- [API Documentation](./api-doc.md)
- [Business Processes](./business-processes.md)
- [Context](./context.md)
