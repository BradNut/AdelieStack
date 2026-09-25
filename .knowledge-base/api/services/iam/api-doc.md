# IAM API Documentation

## Endpoints

### Authentication

#### POST /api/auth/login
Authenticate user with email and password.

**Request:**
```typescript
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response (200):**
```typescript
{
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "requiresMfa": false
  }
}
```

**Response (401):**
```typescript
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

**Rate Limit:** 5 requests per minute per IP

---

#### POST /api/auth/logout
Logout current user and destroy session.

**Request:** No body required

**Response (200):**
```typescript
{
  "data": {
    "success": true
  }
}
```

---

#### POST /api/auth/passkey/login
Authenticate user with passkey (WebAuthn).

**Request:**
```typescript
{
  "credential": {
    "id": "credential_id",
    "rawId": "...",
    "response": {
      "authenticatorData": "...",
      "clientDataJSON": "...",
      "signature": "..."
    },
    "type": "public-key"
  }
}
```

**Response (200):**
```typescript
{
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "name": "John Doe"
    }
  }
}
```

---

### Password Management

#### POST /api/auth/password/reset-request
Request password reset email.

**Request:**
```typescript
{
  "email": "user@example.com"
}
```

**Response (200):**
```typescript
{
  "data": {
    "message": "If the email exists, a reset link has been sent"
  }
}
```

**Note:** Always returns success to prevent email enumeration.

---

#### POST /api/auth/password/reset
Reset password with token from email.

**Request:**
```typescript
{
  "token": "reset_token_from_email",
  "newPassword": "NewSecurePassword123"
}
```

**Response (200):**
```typescript
{
  "data": {
    "success": true
  }
}
```

**Response (400):**
```typescript
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid or expired reset token"
  }
}
```

---

#### POST /api/auth/password/change
Change password (requires authentication).

**Request:**
```typescript
{
  "currentPassword": "OldPassword123",
  "newPassword": "NewSecurePassword123"
}
```

**Response (200):**
```typescript
{
  "data": {
    "success": true
  }
}
```

**Response (401):**
```typescript
{
  "error": {
    "code": "INVALID_PASSWORD",
    "message": "Current password is incorrect"
  }
}
```

---

### Session Management

#### GET /api/auth/sessions
Get all active sessions for current user.

**Response (200):**
```typescript
{
  "data": [
    {
      "id": "session_123",
      "createdAt": "2024-01-01T00:00:00Z",
      "lastActivity": "2024-01-01T12:00:00Z",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "current": true
    }
  ]
}
```

---

#### DELETE /api/auth/sessions/:sessionId
Revoke a specific session.

**Response (200):**
```typescript
{
  "data": {
    "success": true
  }
}
```

---

#### DELETE /api/auth/sessions
Revoke all sessions except current.

**Response (200):**
```typescript
{
  "data": {
    "revokedCount": 3
  }
}
```

---

### User Profile

#### GET /api/auth/me
Get current authenticated user profile.

**Response (200):**
```typescript
{
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "roles": ["user"],
    "mfaEnabled": true,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

**Response (401):**
```typescript
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

---

#### PATCH /api/auth/me
Update current user profile.

**Request:**
```typescript
{
  "name": "Jane Doe",
  "email": "newemail@example.com"
}
```

**Response (200):**
```typescript
{
  "data": {
    "id": "user_123",
    "email": "newemail@example.com",
    "name": "Jane Doe",
    "updatedAt": "2024-01-01T12:00:00Z"
  }
}
```

---

### Multi-Step Authentication

#### POST /api/auth/step
Progress through multi-step authentication flow.

**Request:**
```typescript
{
  "step": "email",
  "data": {
    "email": "user@example.com"
  }
}
```

**Response (200):**
```typescript
{
  "data": {
    "nextStep": "password",
    "requiresMfa": false
  }
}
```

---

## Validation Schemas

### Login Schema
```typescript
{
  email: string (email format),
  password: string (min 8 characters)
}
```

### Password Reset Request Schema
```typescript
{
  email: string (email format)
}
```

### Password Reset Schema
```typescript
{
  token: string (required),
  newPassword: string (min 8 characters)
}
```

### Password Change Schema
```typescript
{
  currentPassword: string (required),
  newPassword: string (min 8 characters)
}
```

### Profile Update Schema
```typescript
{
  name?: string (1-100 characters),
  email?: string (email format)
}
```

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_CREDENTIALS` | 401 | Email or password incorrect |
| `ACCOUNT_LOCKED` | 403 | Too many failed login attempts |
| `INVALID_TOKEN` | 400 | Reset token invalid or expired |
| `INVALID_PASSWORD` | 401 | Current password incorrect |
| `EMAIL_EXISTS` | 409 | Email already in use |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `UNAUTHORIZED` | 401 | Authentication required |
| `SESSION_EXPIRED` | 401 | Session has expired |

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `POST /api/auth/login` | 5 requests/minute per IP |
| `POST /api/auth/password/reset-request` | 3 requests/hour per IP |
| `POST /api/auth/password/reset` | 5 requests/hour per IP |
| Other endpoints | 100 requests/minute per user |

## Related Documentation

- [Overview](./overview.md)
- [Business Processes](./business-processes.md)
- [Data Model](./data-model.md)
