# IAM Business Processes

## Authentication Workflows

### Standard Login Flow

```
1. User submits email and password
   ↓
2. Validate input format (Zod schema)
   ↓
3. Rate limit check (Redis)
   ↓
4. Query user by email (Database)
   ↓
5. Compare password hash (bcrypt)
   ↓
6. Check if MFA required
   ├─ Yes → Return requiresMfa: true
   └─ No → Continue
   ↓
7. Create session (Redis)
   ↓
8. Set session cookie
   ↓
9. Log authentication event (Audit)
   ↓
10. Return user data
```

### Passkey Login Flow

```
1. User initiates passkey login
   ↓
2. Generate authentication challenge
   ↓
3. User authenticates with device
   ↓
4. Verify WebAuthn credential
   ↓
5. Query user by credential ID
   ↓
6. Validate signature
   ↓
7. Create session (Redis)
   ↓
8. Set session cookie
   ↓
9. Log authentication event
   ↓
10. Return user data
```

### Multi-Step Authentication Flow

```
Step 1: Email Verification
  - User enters email
  - Check if email exists
  - Return next step indicator

Step 2: Password Verification
  - User enters password
  - Validate password
  - Check if MFA required
  - Return MFA requirement

Step 3: MFA Verification (if required)
  - User provides MFA code
  - Validate with MFA service
  - Create session on success

Step 4: Session Creation
  - Generate session token
  - Store in Redis
  - Return session cookie
```

## Password Management Workflows

### Password Reset Request

```
1. User submits email
   ↓
2. Validate email format
   ↓
3. Rate limit check
   ↓
4. Query user by email
   ├─ Not found → Return generic success (prevent enumeration)
   └─ Found → Continue
   ↓
5. Generate reset token (cryptographically secure)
   ↓
6. Store token with expiration (Redis, 1 hour)
   ↓
7. Send reset email (Email service)
   ↓
8. Return generic success message
```

### Password Reset Completion

```
1. User clicks email link with token
   ↓
2. User submits new password
   ↓
3. Validate token (Redis lookup)
   ├─ Invalid/Expired → Return error
   └─ Valid → Continue
   ↓
4. Validate new password strength
   ↓
5. Hash new password (bcrypt)
   ↓
6. Update user password (Database)
   ↓
7. Invalidate reset token (Redis)
   ↓
8. Revoke all existing sessions (Redis)
   ↓
9. Log password change event (Audit)
   ↓
10. Send confirmation email
   ↓
11. Return success
```

### Password Change (Authenticated)

```
1. User submits current and new password
   ↓
2. Validate session
   ↓
3. Verify current password
   ├─ Invalid → Return error
   └─ Valid → Continue
   ↓
4. Validate new password strength
   ↓
5. Hash new password (bcrypt)
   ↓
6. Update user password (Database)
   ↓
7. Revoke other sessions (keep current)
   ↓
8. Log password change event (Audit)
   ↓
9. Send confirmation email
   ↓
10. Return success
```

## Session Management Workflows

### Session Creation

```
1. User successfully authenticates
   ↓
2. Generate session ID (UUID)
   ↓
3. Create session data:
   - User ID
   - IP address
   - User agent
   - Created timestamp
   - Expiration timestamp
   ↓
4. Store in Redis with TTL
   ↓
5. Set HttpOnly, Secure cookie
   ↓
6. Return session cookie to client
```

### Session Validation

```
1. Request received with session cookie
   ↓
2. Extract session ID from cookie
   ↓
3. Query Redis for session data
   ├─ Not found → Return 401 Unauthorized
   └─ Found → Continue
   ↓
4. Check expiration
   ├─ Expired → Delete session, return 401
   └─ Valid → Continue
   ↓
5. Update last activity timestamp
   ↓
6. Attach user data to request context
   ↓
7. Continue to route handler
```

### Session Revocation

```
Single Session:
1. User requests session deletion
   ↓
2. Validate current session
   ↓
3. Delete target session from Redis
   ↓
4. Log session revocation event
   ↓
5. Return success

All Sessions:
1. User requests logout from all devices
   ↓
2. Validate current session
   ↓
3. Query all sessions for user
   ↓
4. Delete all sessions except current
   ↓
5. Log bulk revocation event
   ↓
6. Return count of revoked sessions
```

## Business Rules

### Password Requirements
- Minimum 8 characters
- Must contain at least one uppercase letter
- Must contain at least one lowercase letter
- Must contain at least one number
- Must contain at least one special character
- Cannot be same as previous password
- Cannot contain user's email or name

### Session Rules
- Default expiration: 7 days
- Extended expiration (remember me): 30 days
- Sliding window: Activity extends expiration
- Maximum concurrent sessions: 10 per user
- Automatic cleanup of expired sessions

### Rate Limiting Rules
- Login attempts: 5 per minute per IP
- Password reset requests: 3 per hour per IP
- Password reset completions: 5 per hour per IP
- Account lockout: 10 failed attempts in 1 hour
- Lockout duration: 1 hour

### Account Lockout
- Triggered after 10 failed login attempts
- Duration: 1 hour
- Can be manually unlocked by admin
- User notified via email
- Audit log entry created

## Security Considerations

### Password Storage
- Never store plaintext passwords
- Use bcrypt with 12 salt rounds
- Hash on server side only
- Validate strength before hashing

### Session Security
- HttpOnly cookies (prevent XSS)
- Secure flag in production (HTTPS only)
- SameSite=Lax (CSRF protection)
- Regenerate session ID on privilege change
- Clear session on logout

### Token Security
- Cryptographically secure random tokens
- Short expiration (1 hour for reset)
- Single-use tokens
- Invalidate on use or expiration
- Store hashed in database

### Audit Trail
- Log all authentication events
- Log password changes
- Log session creation/destruction
- Log failed login attempts
- Include IP address and user agent

## Error Handling

### Failed Login
- Generic error message (prevent enumeration)
- Increment failed attempt counter
- Check for account lockout threshold
- Log failed attempt with IP
- Return 401 Unauthorized

### Expired Session
- Delete session from Redis
- Clear session cookie
- Return 401 Unauthorized
- Redirect to login page

### Invalid Reset Token
- Log suspicious activity
- Return generic error
- Do not reveal if token existed
- Rate limit reset attempts

## Integration Points

### MFA Service
- Check if user has MFA enabled
- Validate MFA codes during login
- Require MFA for sensitive operations

### Email Service
- Send password reset emails
- Send password change confirmations
- Send account lockout notifications
- Send new device login alerts

### Audit Service
- Log authentication events
- Log password changes
- Log session management events
- Log security events (lockouts, etc.)

### User Service
- Query user data
- Update user profile
- Check user status (active, locked, etc.)

## Related Documentation

- [Overview](./overview.md)
- [API Documentation](./api-doc.md)
- [Data Model](./data-model.md)
- [Runbook](./runbook.md)
