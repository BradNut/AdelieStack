# IAM Service Dependencies

## Internal Dependencies

### Database Service (Drizzle ORM)
**Package:** `drizzle-orm`  
**Location:** `apps/api/src/lib/server/api/databases/`

**Purpose:** User credential storage and retrieval

**Usage:**
```typescript
import { db } from '$lib/server/api/databases/db';
import { users } from '$lib/server/api/databases/schema';

// Query user by email
const user = await db.query.users.findFirst({
  where: eq(users.email, email)
});

// Update password
await db.update(users)
  .set({ passwordHash: newHash, updatedAt: new Date() })
  .where(eq(users.id, userId));
```

**Failure Impact:** Critical - Cannot authenticate users  
**Retry Strategy:** None - fail fast  
**Circuit Breaker:** Not implemented

---

### Redis Service
**Package:** `ioredis`  
**Location:** `apps/api/src/lib/server/api/services/redis.service.ts`

**Purpose:** Session storage, rate limiting, temporary tokens

**Usage:**
```typescript
import { RedisService } from '$lib/server/api/services/redis.service';

const redis = RedisService.getInstance();

// Store session
await redis.client.setex(
  `session:${sessionId}`,
  SESSION_TTL,
  JSON.stringify(sessionData)
);

// Get session
const session = await redis.client.get(`session:${sessionId}`);

// Rate limiting
const attempts = await redis.client.incr(`ratelimit:login:${ip}`);
await redis.client.expire(`ratelimit:login:${ip}`, 60);
```

**Configuration:**
- Lazy connection: `lazyConnect: true`
- Retry strategy: Exponential backoff
- Max retries: 3

**Failure Impact:** Critical - Cannot create or validate sessions  
**Fallback:** None - return 503 Service Unavailable

---

### Email Service
**Package:** `nodemailer`  
**Location:** `apps/api/src/lib/server/api/mail/`

**Purpose:** Send password reset and notification emails

**Usage:**
```typescript
import { EmailService } from '$lib/server/api/mail/email.service';

await emailService.sendPasswordReset({
  to: user.email,
  resetUrl: `https://secondchancepuzzles.com/reset?token=${token}`,
  expiresIn: '1 hour'
});

await emailService.sendPasswordChanged({
  to: user.email,
  timestamp: new Date()
});
```

**Failure Impact:** Non-critical - Log error, return success to user  
**Fallback:** Log error, continue operation  
**Retry Strategy:** 3 retries with exponential backoff

---

### MFA Service
**Location:** `apps/api/src/lib/server/api/mfa/`

**Purpose:** Check MFA status and validate codes

**Usage:**
```typescript
import { MfaService } from '$lib/server/api/mfa/mfa.service';

// Check if user has MFA enabled
const mfaEnabled = await mfaService.isEnabled(userId);

// Validate MFA code
const isValid = await mfaService.validateCode(userId, code);
```

**Failure Impact:** Critical for MFA-enabled users  
**Fallback:** None - return error if MFA check fails

---

### Audit Service
**Location:** `apps/api/src/lib/server/api/audit/`

**Purpose:** Log authentication and security events

**Usage:**
```typescript
import { AuditService } from '$lib/server/api/audit/audit.service';

await auditService.log({
  type: 'authentication',
  action: 'login_success',
  userId: user.id,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  metadata: { method: 'password' }
});
```

**Failure Impact:** Non-critical - Log error, continue operation  
**Fallback:** Log to console if service unavailable  
**Async:** Fire-and-forget (don't block auth flow)

---

## External Dependencies

### bcrypt
**Package:** `bcrypt`  
**Version:** `^5.1.1`

**Purpose:** Password hashing and verification

**Usage:**
```typescript
import bcrypt from 'bcrypt';

// Hash password
const hash = await bcrypt.hash(password, 12);

// Verify password
const isValid = await bcrypt.compare(password, hash);
```

**Configuration:**
- Salt rounds: 12
- Async operations only

---

### Zod
**Package:** `zod`  
**Version:** `^3.22.4`

**Purpose:** Input validation and schema definition

**Usage:**
```typescript
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const validated = loginSchema.parse(input);
```

---

### Hono
**Package:** `hono`  
**Version:** `^4.x`

**Purpose:** Web framework for route handlers

**Usage:**
```typescript
import { Hono } from 'hono';

const app = new Hono();

app.post('/api/auth/login', async (c) => {
  // Handler implementation
});
```

---

### @simplewebauthn/server
**Package:** `@simplewebauthn/server`  
**Version:** `^9.x`

**Purpose:** WebAuthn/Passkey authentication

**Usage:**
```typescript
import { verifyAuthenticationResponse } from '@simplewebauthn/server';

const verification = await verifyAuthenticationResponse({
  response: credential,
  expectedChallenge: challenge,
  expectedOrigin: origin,
  expectedRPID: rpId,
  authenticator: {
    credentialID: passkey.credentialId,
    credentialPublicKey: passkey.publicKey,
    counter: passkey.counter
  }
});
```

---

## Shared Constants

### From `@secondchance/shared`
```typescript
import { CredentialsType } from '@secondchance/shared/constants';

// Use shared constants instead of hardcoded strings
const credentialType = CredentialsType.PASSWORD;
```

### From `apps/api/src/lib/constants`
```typescript
// Session configuration
export const SESSION_EXPIRY_DAYS = 7;
export const SESSION_EXTENDED_DAYS = 30;

// Rate limiting
export const LOGIN_RATE_LIMIT = 5;
export const LOGIN_RATE_WINDOW = 60; // seconds

// Password requirements
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const BCRYPT_ROUNDS = 12;
```

---

## Environment Variables

Required environment variables for IAM service:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Redis
REDIS_URL=redis://localhost:6379

# Email (Mailpit for dev)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=noreply@secondchancepuzzles.com

# Application
APP_URL=https://secondchancepuzzles.com
NODE_ENV=production

# Security
SESSION_SECRET=<random-secret>
CSRF_SECRET=<random-secret>

# Optional
BCRYPT_ROUNDS=12
SESSION_EXPIRY_DAYS=7
```

---

## Dependency Injection

### Service Initialization
```typescript
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService
  ) {}
}

// Factory function
export function createAuthService() {
  return new AuthService(
    DatabaseService.getInstance(),
    RedisService.getInstance(),
    EmailService.getInstance(),
    AuditService.getInstance(),
    MfaService.getInstance()
  );
}
```

---

## Dependency Health Checks

### Database Health
```typescript
async function checkDatabaseHealth() {
  try {
    await db.execute(sql`SELECT 1`);
    return { status: 'healthy' };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}
```

### Redis Health
```typescript
async function checkRedisHealth() {
  try {
    await redis.client.ping();
    return { status: 'healthy' };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}
```

---

## Dependency Update Policy

### Security Updates
- Apply immediately for critical vulnerabilities
- Test in staging before production
- Monitor security advisories

### Minor Updates
- Review changelog
- Update in development first
- Run full test suite
- Deploy to staging
- Monitor for issues

### Major Updates
- Plan migration carefully
- Review breaking changes
- Update code as needed
- Comprehensive testing
- Staged rollout

---

## Related Documentation

- [Overview](./overview.md)
- [Context](./context.md)
- [Data Model](./data-model.md)
- [Runbook](./runbook.md)
