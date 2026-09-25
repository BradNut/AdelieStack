# API Core Principles

## Design Philosophy

### 1. Type Safety First
- Use TypeScript strict mode for all code
- Prefer interfaces over types
- Avoid enums; use const objects with `as const`
- Comprehensive type definitions for all API contracts

### 2. Lazy Service Initialization
- Services must not connect to external resources at import/build time
- Use getter-based lazy initialization for database, Redis, and external services
- Configure services with `lazyConnect: true` where applicable
- Prevents build failures due to unavailable infrastructure

### 3. Shared Constants & Boundaries
- Reuse existing constants before creating new literals
- Place shared domain constants in `src/lib/shared/**` or similar client-safe modules
- Keep server-only constants in `src/lib/server/**`
- Never expose server-only code to client bundles

### 4. Database Migration Discipline
- **Never** manually write or edit Drizzle migration SQL files
- **Never** hand-edit Drizzle metadata/journal files
- Always use `drizzle-kit generate` and `drizzle-kit migrate`
- Keep schema and migrations in sync through tooling

### 5. Error Handling & Suppression
- Fix root causes, not symptoms
- Do not suppress warnings/errors with `@ts-ignore`, `eslint-disable`, etc.
- Only use suppressions when explicitly approved and documented
- Prefer minimal upstream fixes over downstream workarounds

### 6. Testing Requirements
- Every test suite must include positive (happy path) and negative (error/edge case) coverage
- Required negative scenarios:
  - Validation failures
  - Resource not found (404)
  - Duplicate/unique constraint violations
  - Permission/authorization failures
  - External dependency failures (mocked)
  - Edge boundaries (empty, null, min/max values)
- Maintain A+ test coverage standards

## Code Organization

### Service Structure

Modules under `apps/api/src/lib/server/api/` are flat, not nested by layer:

```
<module>/
  <module>.controller.ts   # Hono route handlers
  <module>.service.ts      # Business logic
  <module>.repository.ts   # Data access layer
  tables/                  # Drizzle table definitions
  dtos/                    # Request/response DTOs
```

See `apps/api/AGENTS.md`'s "Local Map" section for the authoritative file-path conventions.

### Naming Conventions
- **Files**: kebab-case (e.g., `user-service.ts`)
- **Classes**: PascalCase (e.g., `UserService`)
- **Functions/Variables**: camelCase (e.g., `getUserById`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_UPLOAD_SIZE`)
- **Interfaces**: PascalCase with descriptive names (e.g., `UserProfile`)

## Security Principles

1. **Authentication Required** - All endpoints except public routes require valid session
2. **Authorization Checks** - Verify permissions before data access
3. **Input Validation** - Validate all inputs with Zod schemas
4. **Output Sanitization** - Never expose sensitive data in responses
5. **Rate Limiting** - Apply rate limits to prevent abuse
6. **CSRF Protection** - Implement CSRF tokens for state-changing operations

## Performance Principles

1. **Minimal JavaScript** - Optimize bundle size and runtime performance
2. **Efficient Queries** - Use database indexes and query optimization
3. **Caching Strategy** - Cache frequently accessed data in Redis
4. **Lazy Loading** - Load resources only when needed
5. **Connection Pooling** - Reuse database connections efficiently

## API Design Principles

1. **RESTful Conventions** - Follow REST best practices
2. **Consistent Response Format** - Standardized success/error responses
3. **Versioning Strategy** - Plan for API evolution
4. **Pagination** - Implement cursor or offset pagination for lists
5. **Filtering & Sorting** - Support flexible data retrieval

## Related Documentation

- [Overview](./overview.md)
- [Coding Standards](./standards/coding-standards.md)
- [Testing Standards](./standards/testing-standards.md)
