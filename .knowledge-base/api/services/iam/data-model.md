# IAM Data Model

## Database Schema

### Users Table (Partial - IAM-relevant fields)

```typescript
// apps/api/src/lib/server/api/databases/schema/users.ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('email_verified').default(false),
  passwordHash: varchar('password_hash', { length: 255 }),
  name: varchar('name', { length: 100 }),
  
  // Account status
  isActive: boolean('is_active').default(true),
  isLocked: boolean('is_locked').default(false),
  lockedUntil: timestamp('locked_until'),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  lastLoginAt: timestamp('last_login_at'),
  
  // Security
  failedLoginAttempts: integer('failed_login_attempts').default(0),
  lastFailedLoginAt: timestamp('last_failed_login_at'),
});
```

**Indexes:**
- `users_email_idx` on `email` (unique)
- `users_id_idx` on `id` (primary key)

**Constraints:**
- `email` must be unique
- `passwordHash` can be null (for passkey-only accounts)

---

### Passkeys Table

```typescript
export const passkeys = pgTable('passkeys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  credentialId: varchar('credential_id', { length: 255 }).notNull().unique(),
  publicKey: text('public_key').notNull(),
  counter: bigint('counter', { mode: 'number' }).default(0),
  
  // Device info
  deviceName: varchar('device_name', { length: 100 }),
  transports: json('transports').$type<string[]>(),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
});
```

**Indexes:**
- `passkeys_user_id_idx` on `userId`
- `passkeys_credential_id_idx` on `credentialId` (unique)

**Relationships:**
- `userId` → `users.id` (foreign key)

---

## Redis Data Structures

### Session Storage

**Key Pattern:** `session:{sessionId}`

**Value (JSON):**
```typescript
{
  userId: string;
  createdAt: number; // Unix timestamp
  lastActivity: number; // Unix timestamp
  expiresAt: number; // Unix timestamp
  ipAddress: string;
  userAgent: string;
  deviceInfo?: {
    browser: string;
    os: string;
    device: string;
  };
}
```

**TTL:** 7 days (default) or 30 days (remember me)

---

### Rate Limiting

**Key Pattern:** `ratelimit:login:{ipAddress}`

**Value:** Integer (attempt count)

**TTL:** 60 seconds (1 minute window)

---

**Key Pattern:** `ratelimit:reset:{ipAddress}`

**Value:** Integer (attempt count)

**TTL:** 3600 seconds (1 hour window)

---

### Account Lockout

**Key Pattern:** `lockout:{userId}`

**Value (JSON):**
```typescript
{
  attempts: number;
  lockedUntil: number; // Unix timestamp
  reason: string;
}
```

**TTL:** 3600 seconds (1 hour)

---

### Password Reset Tokens

**Key Pattern:** `reset:{token}`

**Value (JSON):**
```typescript
{
  userId: string;
  email: string;
  createdAt: number;
  expiresAt: number;
}
```

**TTL:** 3600 seconds (1 hour)

---

### Temporary MFA Tokens

**Key Pattern:** `mfa:temp:{token}`

**Value (JSON):**
```typescript
{
  userId: string;
  createdAt: number;
  expiresAt: number;
}
```

**TTL:** 300 seconds (5 minutes)

---

## TypeScript Interfaces

### User (IAM Context)

```typescript
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  isActive: boolean;
  isLocked: boolean;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}
```

### Session

```typescript
export interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  deviceInfo?: DeviceInfo;
}

export interface DeviceInfo {
  browser: string;
  os: string;
  device: string;
}
```

### Passkey

```typescript
export interface Passkey {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceName: string | null;
  transports: string[] | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}
```

### Authentication Request/Response

```typescript
export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  user: User;
  requiresMfa: boolean;
  tempToken?: string; // If MFA required
}

export interface PasskeyLoginRequest {
  credential: PublicKeyCredential;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}
```

## Data Relationships

```
users (1) ──< (N) passkeys
  │
  │ (referenced by)
  │
  ├─ sessions (Redis)
  ├─ password_reset_tokens (Redis)
  ├─ rate_limits (Redis)
  └─ lockout_records (Redis)
```

## Data Lifecycle

### Session Lifecycle
1. **Creation**: User successfully authenticates
2. **Active**: Session validated on each request, lastActivity updated
3. **Expiration**: TTL expires in Redis, session auto-deleted
4. **Revocation**: User logs out or admin revokes, session deleted immediately

### Password Reset Token Lifecycle
1. **Creation**: User requests password reset
2. **Active**: Token valid for 1 hour
3. **Consumption**: Token used to reset password, immediately deleted
4. **Expiration**: TTL expires, token auto-deleted

### Rate Limit Lifecycle
1. **First Request**: Counter created with value 1
2. **Subsequent Requests**: Counter incremented
3. **Limit Exceeded**: Requests blocked until TTL expires
4. **Reset**: TTL expires, counter deleted

## Data Validation

### Email Validation
- Format: RFC 5322 compliant
- Lowercase normalization
- Maximum length: 255 characters
- Uniqueness enforced at database level

### Password Validation
- Minimum length: 8 characters
- Maximum length: 128 characters
- Complexity requirements enforced
- Never stored in plaintext
- Hashed with bcrypt (12 rounds)

### Session ID Validation
- Format: UUID v4
- Cryptographically random
- Unique per session
- HttpOnly cookie storage

## Data Security

### Sensitive Fields
- `passwordHash`: Never returned in API responses
- `sessionId`: HttpOnly cookie only
- `resetToken`: Single-use, time-limited

### Encryption
- Passwords: bcrypt hashing (one-way)
- Session cookies: Signed and encrypted
- Reset tokens: Cryptographically random

### Data Retention
- Sessions: 7-30 days (configurable)
- Reset tokens: 1 hour
- Rate limit data: 1 minute to 1 hour
- Audit logs: Indefinite (separate service)

## Migration Considerations

### Adding New Fields
- Use Drizzle migrations (`drizzle-kit generate`)
- Never manually edit migration SQL
- Test migrations on staging first
- Plan for backward compatibility

### Schema Changes
- Add fields as nullable initially
- Backfill data if needed
- Make non-nullable after backfill
- Update TypeScript types

## Related Documentation

- [Overview](./overview.md)
- [API Documentation](./api-doc.md)
- [Business Processes](./business-processes.md)
- [Context](./context.md)
