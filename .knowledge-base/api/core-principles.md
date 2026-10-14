# API Core Principles

The repo-wide rules (constants first, `as const` objects, lazy infra, Drizzle tooling, no suppressions,
negative tests) live in the root [AGENTS.md](../../AGENTS.md); this file does not repeat them. Details sit in
the matching standard: [coding](./standards/coding-standards.md) (including lazy initialization),
[testing](./standards/testing-standards.md), [security](./standards/security-standards.md),
[API conventions](./standards/api-conventions.md).

## Module Layout

Modules under `apps/api/src/lib/server/api/` are flat, not nested by layer:

```
<module>/
  <module>.controller.ts   # Hono route handlers
  <module>.service.ts      # Business logic
  <module>.repository.ts   # Data access layer
  tables/                  # Drizzle table definitions
  dtos/                    # Request/response DTOs
```

API source files use relative imports, not path aliases: the API's types reach the web typecheck
through the RPC contract, so API code must not depend on API-only aliases.

## Naming

- **Files**: kebab-case (`user-service.ts`)
- **Classes and interfaces**: PascalCase (`UserService`, `UserProfile`)
- **Functions and variables**: camelCase (`getUserById`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_UPLOAD_SIZE`)

## Related Documentation

- [Overview](./overview.md)
- [Coding Standards](./standards/coding-standards.md)
- [Testing Standards](./standards/testing-standards.md)
