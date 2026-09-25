# API Coding Standards

## TypeScript Guidelines

### Type Safety
- Enable TypeScript strict mode
- Use `interface` over `type` for object shapes
- Avoid `enum`; use const objects with `as const`
- Explicit return types for public functions
- No `any` types; use `unknown` if type is truly unknown

### Examples

```typescript
// ✅ Preferred: Interface
interface UserProfile {
  id: string;
  name: string;
  email: string;
}

// ❌ Avoid: Type alias for simple objects
type UserProfile = {
  id: string;
  name: string;
};

// ✅ Preferred: Const object
const UserRole = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest'
} as const;

type UserRoleType = typeof UserRole[keyof typeof UserRole];

// ❌ Avoid: Enum
enum UserRole {
  ADMIN = 'admin',
  USER = 'user'
}
```

## Code Organization

### File Structure
```
services/{service-name}/
├── routes/              # Hono route handlers
│   ├── {feature}.routes.ts
│   └── {feature}.routes.test.ts
├── services/            # Business logic
│   ├── {feature}.service.ts
│   └── {feature}.service.test.ts
├── repositories/        # Data access
│   ├── {feature}.repository.ts
│   └── {feature}.repository.test.ts
├── validations/         # Zod schemas
│   └── {feature}.validation.ts
└── types/              # TypeScript interfaces
    └── {feature}.types.ts
```

### Naming Conventions

#### Files
- **kebab-case**: `user-service.ts`, `auth-routes.ts`
- **Test files**: `{name}.test.ts` or `{name}.spec.ts`
- **Type files**: `{name}.types.ts`

#### Code Elements
- **Classes**: PascalCase - `UserService`, `AuthController`
- **Functions**: camelCase - `getUserById`, `validateEmail`
- **Variables**: camelCase - `userId`, `isAuthenticated`
- **Constants**: UPPER_SNAKE_CASE - `MAX_UPLOAD_SIZE`, `DEFAULT_PAGE_SIZE`
- **Interfaces**: PascalCase - `UserProfile`, `ApiResponse`
- **Type aliases**: PascalCase - `UserId`, `EmailAddress`

## Shared Constants & Reuse

### Before Creating New Literals
1. Check `src/lib/shared/**` for existing constants
2. Check service-specific const objects
3. Only create new constants if no existing value fits

### Placement Rules
- **Shared domain constants**: `src/lib/shared/**` (client-safe)
- **Server-only constants**: `src/lib/server/**`
- **Service constants**: Within service folder
- **Never** hardcode strings/numbers that appear multiple times

### Example
```typescript
// ✅ Reuse existing constants
import { CredentialsType } from '$lib/shared/constants';

const credentialType = CredentialsType.PASSWORD;

// ❌ Avoid hardcoded literals
const credentialType = 'password';
```

## Error Handling

### No Suppression Without Justification
- **Never** use `@ts-ignore`, `eslint-disable`, `svelte-ignore` to hide issues
- Fix root causes, not symptoms
- Only suppress with explicit approval and documentation

### Proper Error Handling
```typescript
// ✅ Proper error handling
try {
  const user = await getUserById(id);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user;
} catch (error) {
  if (error instanceof NotFoundError) {
    throw error;
  }
  throw new InternalServerError('Failed to fetch user');
}

// ❌ Avoid suppression
// @ts-ignore - TODO: fix this later
const user = await getUserById(id);
```

## Service Patterns

### Lazy Initialization
Services must not connect to external resources at import time.

```typescript
// ✅ Lazy initialization with getter
class DatabaseService {
  private _client?: PostgresClient;
  
  get client() {
    if (!this._client) {
      this._client = new PostgresClient({ lazyConnect: true });
    }
    return this._client;
  }
}

// ❌ Immediate connection at import
const dbClient = new PostgresClient(); // Connects immediately
```

### Dependency Injection
```typescript
// ✅ Constructor injection
class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService
  ) {}
  
  async createUser(data: CreateUserInput) {
    const user = await this.userRepository.create(data);
    await this.emailService.sendWelcome(user.email);
    return user;
  }
}
```

## Validation

### Zod Schemas
- Define validation schemas in `validations/` folder
- Reuse schemas across routes and services
- Export inferred types from schemas

```typescript
// validations/user.validation.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8)
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
```

## Testing

### Test Organization
- Co-locate tests with source files: `{name}.test.ts`
- Use descriptive test names
- Include positive and negative test cases
- Mock external dependencies

### Test Structure
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid data', async () => {
      // Arrange
      const input = { email: 'test@example.com', name: 'Test' };
      
      // Act
      const result = await userService.createUser(input);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.email).toBe(input.email);
    });
    
    it('should throw error for duplicate email', async () => {
      // Arrange
      const input = { email: 'existing@example.com', name: 'Test' };
      
      // Act & Assert
      await expect(userService.createUser(input))
        .rejects.toThrow('Email already exists');
    });
  });
});
```

## Import Organization

### Import Order
1. External packages (React, Hono, etc.)
2. Internal packages (`@secondchance/*`)
3. Absolute imports (`$lib/*`)
4. Relative imports (`./`, `../`)

```typescript
// External
import { Hono } from 'hono';
import { z } from 'zod';

// Internal packages
import { apiContract } from '@secondchance/api-contract';

// Absolute
import { db } from '$lib/server/db';

// Relative
import { UserService } from './user.service';
```

## Comments & Documentation

### When to Comment
- Complex business logic
- Non-obvious algorithms
- Public API interfaces
- Workarounds (with explanation)

### When NOT to Comment
- Obvious code
- Redundant descriptions
- Commented-out code (delete instead)

```typescript
// ✅ Good comment
// Calculate discount based on user tier and purchase history
// Tier 1: 5%, Tier 2: 10%, Tier 3: 15% + 2% per 10 purchases
function calculateDiscount(user: User): number {
  // ...
}

// ❌ Redundant comment
// Get user by ID
function getUserById(id: string) {
  // ...
}
```

## Related Documentation

- [Core Principles](../core-principles.md)
- [Testing Standards](./testing-standards.md)
- [API Conventions](./api-conventions.md)
