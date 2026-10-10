# API Security Standards

## Authentication

Better Auth owns authentication (see `apps/api/src/lib/server/api/auth/auth.config.ts`). Its
handler is mounted at `/api/auth/*`, ahead of the session middleware and every other route.

### Cookie Sessions
- Sessions are rows in the `sessions` table (PostgreSQL), referenced by an opaque token
- The token travels only in a signed, `httpOnly`, `sameSite: 'lax'` cookie, `secure` over HTTPS
- Better Auth signs and encrypts with `BETTER_AUTH_SECRET` (min 32 chars)
- Better Auth refreshes the session cookie; the `authSession` middleware only reads it and
  exposes `c.var.user` and `c.var.session` (both `null` when signed out)
- Signing out, or revoking a session, deletes its row

### Password Security
- **Hashing**: handled by Better Auth; application code never hashes or stores passwords itself
- **Minimum Length**: 8 characters (Better Auth default)
- **Storage**: never store plaintext passwords; the hash lives on the `accounts` row
- **Reset**: time-limited reset tokens, emailed through the mailer

## Authorization

### Role-Based Access Control (RBAC)
- Roles: `admin`, `support`, `user` (`RoleName` in `@adelie/shared`)
- A user's role is the `role` field the Better Auth admin plugin keeps on the `users` row; it
  defaults to `user` and cannot be set by sign-up or update-user input
- `admin` holds every admin-plugin permission. `support` and `user` hold none: support reaches
  only the routes shared with admin, never the admin plugin's own endpoints
- Permissions checked on every protected endpoint; principle of least privilege

```typescript
// apps/api/src/lib/server/api/common/middleware/role.middleware.ts
export const adminRoleOnly = requireRole(RoleName.ADMIN);
export const adminAndSupportRoleOnly = requireRole(RoleName.ADMIN, RoleName.SUPPORT);

// Usage: 401 when signed out, 403 when the role does not match
this.controller.get('/admin', adminRoleOnly, handler);
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

## Multi-Factor Authentication and Passkeys

Two-factor authentication and passkeys are Better Auth plugins configured in
`apps/api/src/lib/server/api/auth/auth.config.ts`. Their tables come from the generated schema
in `auth/tables/auth.table.ts`.

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
