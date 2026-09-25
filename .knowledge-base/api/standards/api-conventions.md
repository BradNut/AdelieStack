# API Conventions

## REST Principles

### HTTP Methods
- **GET** - Retrieve resources (idempotent, safe)
- **POST** - Create new resources
- **PUT** - Update entire resource (idempotent)
- **PATCH** - Partial update of resource (idempotent)
- **DELETE** - Remove resource (idempotent)

### URL Structure
```
/api/{version}/{resource}/{id}/{sub-resource}
```

Examples:
- `GET /api/v1/users` - List users
- `GET /api/v1/users/:id` - Get specific user
- `POST /api/v1/users` - Create user
- `PATCH /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Delete user
- `GET /api/v1/users/:id/donations` - Get user's donations

## Response Format

### Success Response
```typescript
{
  "data": {
    "id": "123",
    "name": "Example",
    "email": "user@example.com"
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

### List Response with Pagination
```typescript
{
  "data": [
    { "id": "1", "name": "Item 1" },
    { "id": "2", "name": "Item 2" }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "hasMore": true
  }
}
```

### Error Response
```typescript
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "requestId": "req_123abc"
  }
}
```

## Status Codes

### Success Codes
- **200 OK** - Successful GET, PATCH, DELETE
- **201 Created** - Successful POST
- **204 No Content** - Successful DELETE with no response body

### Client Error Codes
- **400 Bad Request** - Invalid request data
- **401 Unauthorized** - Missing or invalid authentication
- **403 Forbidden** - Insufficient permissions
- **404 Not Found** - Resource does not exist
- **409 Conflict** - Duplicate resource or constraint violation
- **422 Unprocessable Entity** - Validation error
- **429 Too Many Requests** - Rate limit exceeded

### Server Error Codes
- **500 Internal Server Error** - Unexpected server error
- **502 Bad Gateway** - Upstream service error
- **503 Service Unavailable** - Service temporarily unavailable

## Pagination

### Query Parameters
```
GET /api/v1/users?page=1&pageSize=20
```

### Cursor-Based Pagination
```
GET /api/v1/users?cursor=abc123&limit=20
```

Response:
```typescript
{
  "data": [...],
  "meta": {
    "nextCursor": "xyz789",
    "hasMore": true
  }
}
```

## Filtering & Sorting

### Filtering
```
GET /api/v1/users?role=admin&status=active
```

### Sorting
```
GET /api/v1/users?sortBy=createdAt&order=desc
```

### Combined
```
GET /api/v1/users?role=admin&sortBy=name&order=asc&page=1&pageSize=20
```

## Versioning

### URL Versioning (Current)
```
/api/v1/users
/api/v2/users
```

### Header Versioning (Future)
```
Accept: application/vnd.secondchance.v1+json
```

## Request Validation

### Zod Schema Validation
All request bodies must be validated using Zod schemas:

```typescript
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8)
});

// In route handler
const validated = createUserSchema.parse(await req.json());
```

### Query Parameter Validation
```typescript
const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'createdAt']).optional()
});
```

## Authentication & Authorization

### Session-Based Authentication
```typescript
// Request with session cookie
GET /api/v1/users/me
Cookie: session=abc123xyz
```

### Authorization Header (Future)
```typescript
// Request with bearer token
GET /api/v1/users/me
Authorization: Bearer <token>
```

### Permission Checks
```typescript
// Check user has required role
if (!user.roles.includes('admin')) {
  throw new ForbiddenError('Admin access required');
}
```

## Rate Limiting

### Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

### Response on Limit Exceeded
```typescript
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "retryAfter": 60
  }
}
```

## CORS

### Allowed Origins
- Production: `https://secondchancepuzzles.com`
- Development: `http://localhost:5173`

### Allowed Methods
- GET, POST, PATCH, DELETE, OPTIONS

### Allowed Headers
- Content-Type, Authorization, Cookie

## Content Negotiation

### Request Content-Type
```
Content-Type: application/json
```

### Response Content-Type
```
Content-Type: application/json; charset=utf-8
```

## Idempotency

### Idempotent Operations
- GET, PUT, PATCH, DELETE should be idempotent
- Multiple identical requests should have same effect as single request

### Idempotency Keys (Future)
```
POST /api/v1/donations
Idempotency-Key: unique-key-123
```

## Caching

### Cache-Control Headers
```typescript
// Public, cacheable for 1 hour
res.setHeader('Cache-Control', 'public, max-age=3600');

// Private, no cache
res.setHeader('Cache-Control', 'private, no-cache');
```

### ETag Support (Future)
```typescript
// Response
ETag: "abc123"

// Conditional request
If-None-Match: "abc123"
// Returns 304 Not Modified if unchanged
```

## File Uploads

### Multipart Form Data
```typescript
POST /api/v1/puzzles/:id/images
Content-Type: multipart/form-data

{
  "file": <binary>,
  "description": "Puzzle box image"
}
```

### Response
```typescript
{
  "data": {
    "url": "https://storage.secondchancepuzzles.com/puzzles/123/image.jpg",
    "size": 1024000,
    "mimeType": "image/jpeg"
  }
}
```

## Webhooks (Future)

### Webhook Payload
```typescript
POST https://client-webhook-url.com/webhook
X-Webhook-Signature: sha256=abc123

{
  "event": "donation.created",
  "data": {
    "id": "123",
    "amount": 25.00
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## API Documentation

### OpenAPI/Swagger
- Document all endpoints with OpenAPI spec
- Include request/response examples
- Document error responses

### Endpoint Documentation Template
```typescript
/**
 * Create a new user
 * 
 * @route POST /api/v1/users
 * @param {CreateUserInput} body - User creation data
 * @returns {User} 201 - Created user
 * @throws {ValidationError} 400 - Invalid input
 * @throws {ConflictError} 409 - Email already exists
 */
```

## Related Documentation

- [Coding Standards](./coding-standards.md)
- [Security Standards](./security-standards.md)
- [Error Handling](./error-handling.md)
