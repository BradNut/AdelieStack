# IAM (Identity & Access Management) Service

## Purpose

The IAM service handles all authentication and access management functionality for the Second Chance Puzzles platform. It provides secure user authentication, session management, password operations, and multi-step authentication flows.

## Responsibilities

- User authentication (login/logout)
- Session management and validation
- Password reset and change operations
- Multi-step authentication flows
- Passkey-based authentication
- Two-factor authentication integration
- User profile management (`/me` endpoint)

## Key Concepts

### Authentication Flow
1. User submits credentials
2. Credentials validated against database
3. Session created in Redis
4. Session cookie returned to client
5. Subsequent requests validated via session

### Session Management
- Sessions stored in Redis for fast access
- Configurable session expiration
- Automatic cleanup of expired sessions
- Session rotation on privilege changes

### Multi-Step Authentication
- Support for progressive authentication
- Step-based verification (email, password, MFA)
- State management across authentication steps

## Technology Stack

- **Framework**: Hono
- **Session Store**: Redis (ioredis)
- **Password Hashing**: bcrypt
- **Validation**: Zod schemas
- **Database**: PostgreSQL via Drizzle ORM

## Service Structure

```
iam/
├── routes/
│   ├── auth-step.routes.ts       # Multi-step auth flow
│   ├── login.routes.ts            # Standard login
│   ├── passkey-login.routes.ts   # Passkey authentication
│   ├── password-reset.routes.ts  # Password reset flow
│   ├── sessions.routes.ts        # Session management
│   ├── two-factor.routes.ts      # 2FA integration
│   └── me.routes.ts              # Current user profile
├── services/
│   ├── auth.service.ts           # Core authentication logic
│   ├── session.service.ts        # Session operations
│   └── password.service.ts       # Password operations
├── repositories/
│   └── user.repository.ts        # User data access
├── validations/
│   └── auth.validation.ts        # Auth input schemas
└── types/
    └── auth.types.ts             # TypeScript interfaces
```

## Core Features

### Login
- Email/password authentication
- Passkey (WebAuthn) authentication
- Rate limiting on failed attempts
- Account lockout protection

### Session Management
- Create/validate/destroy sessions
- Session refresh
- Multi-device session support
- Session activity tracking

### Password Operations
- Password reset via email
- Password change (authenticated)
- Password strength validation
- Secure password hashing

### User Profile
- Get current user information
- Update user profile
- Account settings management

## Security Considerations

- Passwords hashed with bcrypt (12 rounds)
- Sessions stored in Redis with expiration
- Rate limiting on authentication endpoints
- CSRF protection on state-changing operations
- Secure session cookies (HttpOnly, Secure, SameSite)

## Dependencies

### Internal
- `@secondchance/shared` - Shared constants and types
- Database service (Drizzle)
- Redis service (session storage)
- Email service (password reset)

### External
- `bcrypt` - Password hashing
- `ioredis` - Redis client
- `zod` - Input validation
- `hono` - Web framework

## Integration Points

- **MFA Service**: Two-factor authentication verification
- **Email Service**: Password reset emails
- **Audit Service**: Authentication event logging
- **User Service**: User profile data

## Related Documentation

- [API Documentation](./api-doc.md)
- [Business Processes](./business-processes.md)
- [Data Model](./data-model.md)
- [Runbook](./runbook.md)
