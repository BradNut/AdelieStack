# IAM Service Context

## Service Boundaries

### What IAM Owns
- User authentication (login/logout)
- Session lifecycle management
- Password operations (reset, change)
- Passkey authentication
- Multi-step authentication flows
- Current user profile endpoint (`/me`)
- Authentication state management

### What IAM Does NOT Own
- User registration (owned by Signup service)
- MFA enrollment and verification (owned by MFA service)
- User profile management beyond `/me` (owned by Users service)
- Role and permission definitions (owned by Roles service)
- Audit logging (owned by Audit service)

## Service Dependencies

### Upstream Dependencies (IAM depends on)

#### Database Service
- **Purpose**: User credential storage and retrieval
- **Usage**: Query users by email, update passwords
- **Failure Impact**: Cannot authenticate users
- **Fallback**: None - critical dependency

#### Redis Service
- **Purpose**: Session storage and rate limiting
- **Usage**: Store/retrieve sessions, track login attempts
- **Failure Impact**: Cannot create or validate sessions
- **Fallback**: None - critical dependency

#### Email Service
- **Purpose**: Password reset and notification emails
- **Usage**: Send reset links, change confirmations
- **Failure Impact**: Password reset unavailable
- **Fallback**: Log error, return success to user

#### MFA Service
- **Purpose**: Multi-factor authentication verification
- **Usage**: Check if MFA required, validate MFA codes
- **Failure Impact**: Cannot complete MFA-protected logins
- **Fallback**: None for MFA-enabled accounts

### Downstream Dependencies (Services that depend on IAM)

#### All Protected Endpoints
- **Purpose**: Session validation for authenticated requests
- **Usage**: Middleware validates session before route handler
- **Integration**: Session cookie checked on every request

#### User Service
- **Purpose**: User profile operations
- **Usage**: Get current user from session
- **Integration**: User ID from validated session

#### Audit Service
- **Purpose**: Security event logging
- **Usage**: Log authentication events
- **Integration**: Fire-and-forget event emission

## Integration Patterns

### Session Validation Middleware
```typescript
// Used by all protected routes
async function requireAuth(c: Context, next: Next) {
  const sessionId = c.req.cookie('session');
  
  if (!sessionId) {
    throw new UnauthorizedError('Authentication required');
  }
  
  const session = await sessionService.validate(sessionId);
  
  if (!session) {
    throw new UnauthorizedError('Invalid or expired session');
  }
  
  c.set('user', session.user);
  c.set('sessionId', sessionId);
  
  await next();
}
```

### MFA Integration
```typescript
// Check if MFA required after password validation
async function login(email: string, password: string) {
  const user = await validateCredentials(email, password);
  
  // Check with MFA service
  const mfaEnabled = await mfaService.isEnabled(user.id);
  
  if (mfaEnabled) {
    return {
      requiresMfa: true,
      tempToken: generateTempToken(user.id)
    };
  }
  
  // Create session if no MFA required
  const session = await sessionService.create(user.id);
  return { user, session };
}
```

### Audit Logging Integration
```typescript
// Log authentication events
async function logAuthEvent(event: AuthEvent) {
  try {
    await auditService.log({
      type: 'authentication',
      action: event.action,
      userId: event.userId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      success: event.success,
      timestamp: new Date()
    });
  } catch (error) {
    // Don't fail auth flow if audit logging fails
    logger.error('Failed to log auth event', { error });
  }
}
```

## Data Flow

### Login Request Flow
```
Client → IAM Service → Database (user lookup)
                    → Redis (rate limit check)
                    → bcrypt (password verify)
                    → MFA Service (check if enabled)
                    → Redis (create session)
                    → Audit Service (log event)
                    → Client (session cookie)
```

### Session Validation Flow
```
Client → IAM Middleware → Redis (session lookup)
                       → Database (user data if needed)
                       → Route Handler (with user context)
```

### Password Reset Flow
```
Client → IAM Service → Database (user lookup)
                    → Redis (rate limit + store token)
                    → Email Service (send reset link)
                    → Client (success response)

[User clicks email link]

Client → IAM Service → Redis (validate token)
                    → bcrypt (hash new password)
                    → Database (update password)
                    → Redis (revoke sessions)
                    → Email Service (confirmation)
                    → Audit Service (log event)
                    → Client (success response)
```

## State Management

### Session State (Redis)
```typescript
{
  sessionId: string;
  userId: string;
  createdAt: timestamp;
  lastActivity: timestamp;
  expiresAt: timestamp;
  ipAddress: string;
  userAgent: string;
}
```

### Rate Limit State (Redis)
```typescript
{
  key: `ratelimit:login:${ipAddress}`;
  count: number;
  expiresAt: timestamp;
}
```

### Password Reset Token State (Redis)
```typescript
{
  key: `reset:${token}`;
  userId: string;
  expiresAt: timestamp; // 1 hour
}
```

## Error Propagation

### Database Errors
- Connection errors → 500 Internal Server Error
- Constraint violations → 409 Conflict
- Not found → 404 Not Found

### Redis Errors
- Connection errors → 503 Service Unavailable
- Timeout → 503 Service Unavailable

### External Service Errors
- Email service failure → Log error, return success (prevent info leak)
- MFA service failure → 503 Service Unavailable for MFA users
- Audit service failure → Log error, continue (non-critical)

## Performance Considerations

### Caching Strategy
- User credentials: Not cached (always fresh from DB)
- Sessions: Cached in Redis (fast validation)
- Rate limits: Cached in Redis (fast checks)

### Query Optimization
- Index on users.email for fast lookup
- Index on users.id for session validation
- Redis TTL for automatic cleanup

### Concurrency
- Session creation: Atomic operations
- Rate limiting: Redis INCR (atomic)
- Password updates: Database transactions

## Monitoring & Observability

### Key Metrics
- Login success/failure rate
- Session creation rate
- Password reset request rate
- Average session duration
- Rate limit hit rate

### Health Checks
- Database connectivity
- Redis connectivity
- Session validation latency
- Login endpoint latency

### Alerts
- High login failure rate (potential attack)
- Redis connection failures
- Database connection failures
- Unusual password reset volume

## Configuration

### Environment Variables
```bash
# Session configuration
SESSION_EXPIRY_DAYS=7
SESSION_EXTENDED_DAYS=30

# Rate limiting
LOGIN_RATE_LIMIT=5
LOGIN_RATE_WINDOW=60

# Password reset
RESET_TOKEN_EXPIRY_HOURS=1

# Security
BCRYPT_ROUNDS=12
```

## Related Documentation

- [Overview](./overview.md)
- [API Documentation](./api-doc.md)
- [Business Processes](./business-processes.md)
- [Dependencies](./dependencies.md)
