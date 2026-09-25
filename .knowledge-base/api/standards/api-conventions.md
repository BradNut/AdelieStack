# API Conventions

## REST Principles

### HTTP Methods
- **GET** - Retrieve resources (idempotent, safe)
- **POST** - Create new resources
- **PUT** - Update entire resource (idempotent)
- **PATCH** - Partial update of resource (idempotent)
- **DELETE** - Remove resource (idempotent)

### URL Structure

Routes are **not versioned**. Each controller is mounted at a fixed base path under `/api` in
`apps/api/src/lib/server/api/application.controller.ts` (e.g. `.route('/iam', ...)`,
`.route('/users', ...)`, `.route('/signup', ...)`), and route handlers add the remaining path:

```
/api/{controller-base}/{path}
```

Examples (from `iam/iam.controller.ts`, `users/users.controller.ts`, `signup/signup.controller.ts`):
- `POST /api/iam/login` - Sign in with email/password
- `POST /api/iam/logout` - Sign out
- `POST /api/iam/password/reset/request` - Request a password reset code
- `GET /api/users/me` - Get the current user
- `PATCH /api/users/me` - Update the current user (form data)
- `PUT /api/users/me/password` - Change the current user's password
- `DELETE /api/users/me` - Delete the current user
- `POST /api/signup` - Create an account

## Response Format

Controllers return plain JSON via `c.json(...)` — there is no `{data, meta}` / `{error}`
envelope. Success responses are the resource (or a `{ message: string }` acknowledgement)
returned directly; error responses are `c.json({ error: string }, statusCode)` with an HTTP
status from the shared `StatusCodes` constant (`@adelie/shared`).

### Success Response
```typescript
// GET /api/users/me -> c.json(user)
{
  "id": "123",
  "name": "Example",
  "email": "user@example.com"
}
```

### Acknowledgement Response
```typescript
// POST /api/iam/logout -> c.json({ message: 'logout' })
{
  "message": "logout"
}
```

### Error Response
```typescript
// c.json({ error: 'Passwords do not match' }, StatusCodes.UNPROCESSABLE_ENTITY)
{
  "error": "Passwords do not match"
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

## Pagination, Filtering, Sorting

Not currently implemented — no controller accepts `page`, `cursor`, `sortBy`, or filter query
parameters today. If a listing endpoint is added, validate query parameters with a Zod schema
(see [Query Parameter Validation](#query-parameter-validation) below) rather than inventing a
new convention.

## Versioning

Routes are **not versioned**. There is no `/v1`/`/v2` prefix and no `Accept` header
versioning scheme; a route's path (e.g. `/api/iam/login`, `/api/users/me`) is the stable
contract.

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
GET /api/users/me
Cookie: session=abc123xyz
```

### Authorization Header (Future)
```typescript
// Request with bearer token
GET /api/users/me
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
Rate limiting is implemented with `hono-rate-limiter` + a Redis store (see
`common/middleware/rate-limit.middleware.ts`), applied per-route (e.g. login, password
reset/change, email change). It returns HTTP 429 with the library's default body, using the
`RateLimit-*` headers (`standardHeaders: 'draft-6'`) rather than the `X-RateLimit-*` headers
shown above.

## CORS

### Allowed Origins
- Configured via the `ORIGIN` environment variable (see `apps/api/.env.schema`)
- Development default: `http://localhost:5173`

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
POST /api/signup
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
The one real example today is the avatar field on the update-profile endpoint
(`users.controller.ts`), validated with `zValidator('form', updateUserDto)` and stored via
`StorageService` (SeaweedFS/S3-compatible):

```typescript
PATCH /api/users/me
Content-Type: multipart/form-data

{
  "avatar": <binary>,
  ...other profile fields
}
```

The endpoint returns the updated user object (see [Response Format](#response-format)), not a
separate `{data: {url, size, mimeType}}` upload response.

## Webhooks

Not implemented. There is no outbound webhook mechanism in this codebase; do not document one as
current or planned without an issue driving it.

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
 * @route POST /api/users
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
