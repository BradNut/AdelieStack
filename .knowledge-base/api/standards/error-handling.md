# API Error Handling Standards

## Error Response Format

### Standard Error Response
```typescript
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": [] // Optional additional details
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "requestId": "req_123abc"
  }
}
```

## Error Codes

### Client Errors (4xx)

#### 400 Bad Request
```typescript
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid request format"
  }
}
```

#### 401 Unauthorized
```typescript
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

#### 403 Forbidden
```typescript
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions to access this resource"
  }
}
```

#### 404 Not Found
```typescript
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}
```

#### 409 Conflict
```typescript
{
  "error": {
    "code": "CONFLICT",
    "message": "Email already exists",
    "details": [
      {
        "field": "email",
        "value": "user@example.com",
        "constraint": "unique"
      }
    ]
  }
}
```

#### 422 Unprocessable Entity (Validation)
```typescript
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format",
        "value": "invalid-email"
      },
      {
        "field": "password",
        "message": "Password must be at least 8 characters",
        "value": "***"
      }
    ]
  }
}
```

#### 429 Too Many Requests
```typescript
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "retryAfter": 60
  }
}
```

### Server Errors (5xx)

#### 500 Internal Server Error
```typescript
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```

#### 503 Service Unavailable
```typescript
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service temporarily unavailable"
  }
}
```

## Custom Error Classes

### Base Error Class
```typescript
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown[]
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}
```

### Specific Error Classes
```typescript
export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', details?: unknown[]) {
    super(404, 'NOT_FOUND', message, details);
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Validation failed', details?: unknown[]) {
    super(422, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required', details?: unknown[]) {
    super(401, 'UNAUTHORIZED', message, details);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Insufficient permissions', details?: unknown[]) {
    super(403, 'FORBIDDEN', message, details);
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Resource conflict', details?: unknown[]) {
    super(409, 'CONFLICT', message, details);
  }
}

export class RateLimitError extends ApiError {
  constructor(message = 'Rate limit exceeded', retryAfter?: number) {
    super(429, 'RATE_LIMIT_EXCEEDED', message, [{ retryAfter }]);
  }
}

export class InternalServerError extends ApiError {
  constructor(message = 'Internal server error', details?: unknown[]) {
    super(500, 'INTERNAL_SERVER_ERROR', message, details);
  }
}
```

## Error Handling Middleware

### Global Error Handler
```typescript
import { Context } from 'hono';
import { ApiError } from './errors';

export async function errorHandler(err: Error, c: Context) {
  // Log error for monitoring
  console.error('Error:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    requestId: c.get('requestId')
  });
  
  // Send to error tracking service
  if (process.env.NODE_ENV === 'production') {
    await errorTracker.captureException(err);
  }
  
  // Handle known API errors
  if (err instanceof ApiError) {
    return c.json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: c.get('requestId')
      }
    }, err.statusCode);
  }
  
  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    return c.json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.errors.map((e: any) => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }
    }, 422);
  }
  
  // Handle unknown errors
  return c.json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred'
        : err.message
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: c.get('requestId')
    }
  }, 500);
}
```

## Error Throwing Best Practices

### Throw Specific Errors
```typescript
// ✅ Good: Specific error with context
async function getUserById(id: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, id)
  });
  
  if (!user) {
    throw new NotFoundError(`User with id ${id} not found`);
  }
  
  return user;
}

// ❌ Bad: Generic error
async function getUserById(id: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, id)
  });
  
  if (!user) {
    throw new Error('Not found');
  }
  
  return user;
}
```

### Include Helpful Details
```typescript
// ✅ Good: Detailed validation error
function validateAge(age: number) {
  if (age < 0 || age > 120) {
    throw new ValidationError('Invalid age', [
      {
        field: 'age',
        value: age,
        constraint: 'Age must be between 0 and 120'
      }
    ]);
  }
}
```

### Handle Database Errors
```typescript
async function createUser(data: CreateUserInput) {
  try {
    return await db.insert(users).values(data).returning();
  } catch (error) {
    // Handle unique constraint violation
    if (error.code === '23505') { // PostgreSQL unique violation
      throw new ConflictError('Email already exists', [
        {
          field: 'email',
          value: data.email,
          constraint: 'unique'
        }
      ]);
    }
    
    // Re-throw unknown errors
    throw new InternalServerError('Failed to create user');
  }
}
```

## Validation Error Handling

### Zod Schema Validation
```typescript
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  age: z.number().int().min(0).max(120)
});

// In route handler
try {
  const validated = createUserSchema.parse(requestData);
} catch (error) {
  if (error instanceof z.ZodError) {
    throw new ValidationError('Validation failed', error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
      value: e.input
    })));
  }
}
```

## Error Logging

### What to Log
- Error name and message
- Stack trace
- Request ID
- User ID (if authenticated)
- Request path and method
- Timestamp

### What NOT to Log
- Passwords
- Session tokens
- Credit card numbers
- Personal identifiable information (PII)

### Logging Example
```typescript
function logError(error: Error, context: ErrorContext) {
  const logData = {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    request: {
      id: context.requestId,
      method: context.method,
      path: context.path,
      userId: context.userId // Sanitized
    }
  };
  
  if (process.env.NODE_ENV === 'production') {
    logger.error(logData);
  } else {
    console.error(JSON.stringify(logData, null, 2));
  }
}
```

## Error Recovery

### Retry Logic
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError!;
}

// Usage
const result = await withRetry(() => externalApiCall());
```

### Graceful Degradation
```typescript
async function getUserWithFallback(id: string) {
  try {
    // Try primary data source
    return await primaryDb.getUser(id);
  } catch (error) {
    logger.warn('Primary DB failed, using cache', { error });
    
    // Fallback to cache
    const cached = await cache.get(`user:${id}`);
    if (cached) return cached;
    
    // No fallback available
    throw new ServiceUnavailableError('User service temporarily unavailable');
  }
}
```

## Testing Error Handling

### Test Error Cases
```typescript
describe('getUserById', () => {
  it('should throw NotFoundError for non-existent user', async () => {
    await expect(getUserById('non-existent-id'))
      .rejects.toThrow(NotFoundError);
  });
  
  it('should throw ValidationError for invalid ID format', async () => {
    await expect(getUserById('invalid'))
      .rejects.toThrow(ValidationError);
  });
  
  it('should handle database connection errors', async () => {
    vi.spyOn(db, 'query').mockRejectedValue(new Error('Connection failed'));
    
    await expect(getUserById('123'))
      .rejects.toThrow(InternalServerError);
  });
});
```

## Related Documentation

- [API Conventions](./api-conventions.md)
- [Security Standards](./security-standards.md)
- [Testing Standards](./testing-standards.md)
