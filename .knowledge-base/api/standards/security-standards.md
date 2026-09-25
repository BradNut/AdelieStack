# API Security Standards

## Authentication

### Session-Based Authentication
- Sessions stored in Redis with expiration
- Secure, HttpOnly cookies for session tokens
- Session rotation on privilege escalation
- Automatic session cleanup on logout

```typescript
// Session cookie configuration
{
  httpOnly: true,
  secure: true, // HTTPS only in production
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
}
```

### Password Security
- **Hashing**: Argon2 (via the `argon2` package), using library defaults
- **Minimum Length**: 8 characters
- **Complexity**: Enforce strong passwords
- **Storage**: Never store plaintext passwords
- **Reset**: Time-limited reset tokens

Hashing is centralized in `HashingService`
(`apps/api/src/lib/server/api/common/services/hashing.service.ts`); callers should not import
`argon2` directly.

```typescript
import { hash, verify } from 'argon2';

// Hash password
const hashedPassword = await hash(password);

// Verify password
const isValid = await verify(hashedPassword, password);
```

## Authorization

### Role-Based Access Control (RBAC)
- Roles: `admin`, `user`, `guest`
- Permissions checked on every protected endpoint
- Principle of least privilege

```typescript
// Check user role
function requireRole(role: string) {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    if (!user?.roles.includes(role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
    await next();
  };
}

// Usage
app.delete('/api/users/:id', requireRole('admin'), deleteUser);
```

### Resource-Level Authorization
```typescript
// Verify user owns resource
async function authorizeResource(userId: string, resourceId: string) {
  const resource = await getResource(resourceId);
  if (resource.ownerId !== userId) {
    throw new ForbiddenError('Access denied');
  }
  return resource;
}
```

## Input Validation

### Zod Schema Validation
- Validate all inputs with Zod schemas
- Sanitize user input
- Reject unexpected fields

```typescript
import { z } from 'zod';

const userInputSchema = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().min(1).max(100).trim(),
  age: z.number().int().min(0).max(120)
}).strict(); // Reject extra fields
```

### SQL Injection Prevention
- Use parameterized queries (Drizzle ORM)
- Never concatenate user input into SQL
- Use ORM query builders

```typescript
// ✅ Safe: Parameterized query
const user = await db.select()
  .from(users)
  .where(eq(users.email, email));

// ❌ Unsafe: String concatenation
const query = `SELECT * FROM users WHERE email = '${email}'`;
```

### XSS Prevention
- Escape user-generated content
- Use Content-Security-Policy headers
- Sanitize HTML input

```typescript
// CSP header
res.setHeader('Content-Security-Policy', 
  "default-src 'self'; script-src 'self' 'unsafe-inline'");
```

## Rate Limiting

### Redis-Based Rate Limiting
- Per-IP rate limits
- Per-user rate limits
- Different limits for different endpoints

```typescript
// Rate limit configuration
const rateLimits = {
  login: { requests: 5, window: 60 }, // 5 requests per minute
  api: { requests: 100, window: 60 }, // 100 requests per minute
  upload: { requests: 10, window: 3600 } // 10 uploads per hour
};
```

### Response Headers
```typescript
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

## CSRF Protection

### CSRF Tokens
- Generate CSRF tokens for state-changing operations
- Validate tokens on POST, PATCH, DELETE requests
- Use SameSite cookie attribute

```typescript
// Generate CSRF token
const csrfToken = generateSecureToken();
res.cookie('csrf-token', csrfToken, { sameSite: 'strict' });

// Validate CSRF token
function validateCsrf(req: Request) {
  const headerToken = req.headers.get('X-CSRF-Token');
  const cookieToken = req.cookies.get('csrf-token');
  
  if (headerToken !== cookieToken) {
    throw new ForbiddenError('Invalid CSRF token');
  }
}
```

## Secure Headers

### Security Headers
```typescript
// Helmet.js or manual headers
app.use((c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  return next();
});
```

## Data Protection

### Sensitive Data Handling
- Never log passwords, tokens, or sensitive data
- Redact sensitive fields in logs
- Encrypt sensitive data at rest
- Use HTTPS for all communications

```typescript
// Redact sensitive fields
function sanitizeForLogging(user: User) {
  const { password, sessionToken, ...safe } = user;
  return safe;
}
```

### Personal Data
- Comply with GDPR/privacy regulations
- Implement data deletion on user request
- Minimize data collection
- Secure data transmission

## File Upload Security

### File Validation
- Validate file type and size
- Scan files with ClamAV antivirus
- Store files in isolated storage (S3-compatible, SeaweedFS locally)
- Generate unique filenames

```typescript
// File upload validation
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function validateFile(file: File) {
  if (file.size > MAX_FILE_SIZE) {
    throw new ValidationError('File too large');
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ValidationError('Invalid file type');
  }
}

// Scan with ClamAV
const scanResult = await clamav.scanFile(file);
if (scanResult.isInfected) {
  throw new SecurityError('File contains malware');
}
```

### File Storage
- Store files outside web root
- Use presigned URLs for access
- Set appropriate file permissions
- Implement file retention policies

## Secrets Management

### Environment Variables
- Store secrets in environment variables
- Never commit secrets to version control
- Use `.env` files for local development
- Use secret management service in production

```typescript
// Access secrets
const dbPassword = process.env.DATABASE_PASSWORD;
const apiKey = process.env.API_KEY;

// Validate required secrets on startup
if (!dbPassword || !apiKey) {
  throw new Error('Missing required environment variables');
}
```

### Secret Rotation
- Rotate secrets regularly
- Support multiple active secrets during rotation
- Invalidate old secrets after rotation period

## Audit Logging

### Security Events to Log
- Authentication attempts (success/failure)
- Authorization failures
- Password changes
- Account deletions
- Privilege escalations
- Suspicious activity

```typescript
// Audit log entry
await auditLog.create({
  userId: user.id,
  action: 'LOGIN_SUCCESS',
  ipAddress: req.ip,
  userAgent: req.headers.get('User-Agent'),
  timestamp: new Date()
});
```

### Log Security
- Protect logs from unauthorized access
- Retain logs for compliance period
- Monitor logs for security incidents
- Alert on suspicious patterns

## Multi-Factor Authentication (MFA)

MFA is **scaffolded but stubbed**, not a working feature — see
[MFA service overview](../services/mfa/overview.md) for the current state. `apps/api/src/lib/server/api/mfa/`
has a controller endpoint that always returns `501 Not Implemented`, a TOTP service stub whose
methods return `false`/throw, and two unused Drizzle tables (`two_factor`, `recovery_codes`). No
passkey, WebAuthn, or security-key code exists anywhere in the API.

### Planned Methods (not implemented)
- **TOTP** - Time-based one-time passwords, intended to build on the existing `@oslojs/otp`
  dependency
- **Recovery Codes** - Backup codes for account recovery, backed by the existing `recovery_codes`
  table

`@oslojs/webauthn` is listed in `apps/api/package.json` but no MFA code imports or calls it today;
no passkey/WebAuthn route, controller, or hardware-security-key support exists anywhere in the
API and none should be assumed to exist.

### MFA Enforcement (planned)
- Optional for regular users
- Required for admin accounts
- Enforce on sensitive operations

## API Security Best Practices

### 1. Principle of Least Privilege
- Grant minimum necessary permissions
- Restrict access by default
- Require explicit authorization

### 2. Defense in Depth
- Multiple layers of security
- Validate at every layer (client, API, database)
- Fail securely

### 3. Secure Defaults
- Secure by default configuration
- Opt-in for less secure options
- Clear security warnings

### 4. Regular Security Audits
- Code reviews for security issues
- Dependency vulnerability scanning
- Penetration testing
- Security training for developers

## Dependency Security

### Vulnerability Scanning
```bash
# Check for known vulnerabilities
pnpm audit

# Update dependencies
pnpm update
```

### Dependency Management
- Keep dependencies up to date
- Review dependency changes
- Use lock files (`pnpm-lock.yaml`)
- Minimize dependency count

## Incident Response

### Security Incident Procedure
1. **Detect** - Monitor for security events
2. **Contain** - Isolate affected systems
3. **Investigate** - Determine scope and impact
4. **Remediate** - Fix vulnerability
5. **Recover** - Restore normal operations
6. **Review** - Post-incident analysis

### Breach Notification
- Notify affected users
- Report to authorities if required
- Document incident and response
- Implement preventive measures

## Related Documentation

- [API Conventions](./api-conventions.md)
- [Error Handling](./error-handling.md)
- [Testing Standards](./testing-standards.md)
