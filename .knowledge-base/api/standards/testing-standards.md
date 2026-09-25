# API Testing Standards

## Coverage Requirements

### Minimum Standards
- **A+ Coverage**: All test suites must achieve comprehensive coverage
- **Positive Tests**: Happy path scenarios for all features
- **Negative Tests**: Error cases, edge cases, and boundary conditions

### Required Negative Test Scenarios

Every test suite must include:

1. **Validation Failures**
   - Invalid input types
   - Missing required fields
   - Out-of-range values
   - Malformed data

2. **Resource Not Found (404)**
   - Non-existent IDs
   - Deleted resources
   - Unauthorized access to resources

3. **Duplicate & Unique Constraint Violations**
   - Duplicate emails
   - Duplicate usernames
   - Unique key violations

4. **Permission & Authorization Failures**
   - Unauthenticated requests
   - Insufficient permissions
   - Role-based access denials

5. **External Dependency Failures**
   - Database connection errors (mocked)
   - Third-party API failures (mocked)
   - Network timeouts (mocked)

6. **Edge Boundaries**
   - Empty strings
   - Null/undefined values
   - Min/max length boundaries
   - Min/max numeric values
   - Empty arrays/objects

## Test Organization

### File Structure
```
services/iam/
├── routes/
│   ├── auth.routes.ts
│   └── auth.routes.test.ts
├── services/
│   ├── auth.service.ts
│   └── auth.service.test.ts
└── repositories/
    ├── user.repository.ts
    └── user.repository.test.ts
```

### Test Naming Convention
- Test files: `{name}.test.ts` or `{name}.spec.ts`
- Co-locate with source files
- Mirror source file structure

## Test Structure

### Describe Blocks
```typescript
describe('ServiceName', () => {
  describe('methodName', () => {
    it('should handle success case', () => {});
    it('should throw error for invalid input', () => {});
    it('should handle edge case', () => {});
  });
});
```

### Test Anatomy (AAA Pattern)
```typescript
it('should create user with valid data', async () => {
  // Arrange - Setup test data and mocks
  const input = { email: 'test@example.com', name: 'Test User' };
  const mockRepository = vi.fn().mockResolvedValue({ id: '1', ...input });
  
  // Act - Execute the function under test
  const result = await userService.createUser(input);
  
  // Assert - Verify the outcome
  expect(result).toBeDefined();
  expect(result.email).toBe(input.email);
  expect(mockRepository).toHaveBeenCalledWith(input);
});
```

## Positive Test Examples

### Service Layer
```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid data', async () => {
      const input = { email: 'new@example.com', name: 'New User', password: 'SecurePass123' };
      const result = await userService.createUser(input);
      
      expect(result.id).toBeDefined();
      expect(result.email).toBe(input.email);
      expect(result.name).toBe(input.name);
      expect(result.password).toBeUndefined(); // Password should not be returned
    });
    
    it('should send welcome email after user creation', async () => {
      const input = { email: 'new@example.com', name: 'New User', password: 'SecurePass123' };
      const emailSpy = vi.spyOn(emailService, 'sendWelcome');
      
      await userService.createUser(input);
      
      expect(emailSpy).toHaveBeenCalledWith(input.email);
    });
  });
});
```

### Route Layer
```typescript
describe('POST /api/users', () => {
  it('should return 201 and user data for valid request', async () => {
    const input = { email: 'test@example.com', name: 'Test', password: 'Pass123' };
    
    const response = await app.request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.email).toBe(input.email);
  });
});
```

## Negative Test Examples

### Validation Failures
```typescript
describe('createUser', () => {
  it('should throw error for invalid email format', async () => {
    const input = { email: 'invalid-email', name: 'Test', password: 'Pass123' };
    
    await expect(userService.createUser(input))
      .rejects.toThrow('Invalid email format');
  });
  
  it('should throw error for missing required fields', async () => {
    const input = { email: 'test@example.com' }; // Missing name and password
    
    await expect(userService.createUser(input))
      .rejects.toThrow('Missing required fields');
  });
  
  it('should throw error for password too short', async () => {
    const input = { email: 'test@example.com', name: 'Test', password: '123' };
    
    await expect(userService.createUser(input))
      .rejects.toThrow('Password must be at least 8 characters');
  });
});
```

### Resource Not Found
```typescript
describe('getUserById', () => {
  it('should throw NotFoundError for non-existent user', async () => {
    const nonExistentId = 'non-existent-id';
    
    await expect(userService.getUserById(nonExistentId))
      .rejects.toThrow(NotFoundError);
  });
  
  it('should return 404 for deleted user', async () => {
    const deletedUserId = 'deleted-user-id';
    vi.spyOn(userRepository, 'findById').mockResolvedValue(null);
    
    const response = await app.request(`/api/users/${deletedUserId}`);
    expect(response.status).toBe(404);
  });
});
```

### Duplicate & Unique Constraints
```typescript
describe('createUser', () => {
  it('should throw error for duplicate email', async () => {
    const existingEmail = 'existing@example.com';
    const input = { email: existingEmail, name: 'Test', password: 'Pass123' };
    
    // First creation succeeds
    await userService.createUser(input);
    
    // Second creation with same email fails
    await expect(userService.createUser(input))
      .rejects.toThrow('Email already exists');
  });
});
```

### Authorization Failures
```typescript
describe('DELETE /api/users/:id', () => {
  it('should return 401 for unauthenticated request', async () => {
    const response = await app.request('/api/users/123', {
      method: 'DELETE'
    });
    
    expect(response.status).toBe(401);
  });
  
  it('should return 403 for insufficient permissions', async () => {
    const userSession = createMockSession({ role: 'user' });
    
    const response = await app.request('/api/users/123', {
      method: 'DELETE',
      headers: { Cookie: `session=${userSession}` }
    });
    
    expect(response.status).toBe(403);
  });
});
```

### External Dependency Failures
```typescript
describe('sendPasswordResetEmail', () => {
  it('should handle email service failure gracefully', async () => {
    vi.spyOn(emailService, 'send').mockRejectedValue(new Error('SMTP error'));
    
    await expect(userService.sendPasswordResetEmail('test@example.com'))
      .rejects.toThrow('Failed to send password reset email');
  });
  
  it('should handle database connection error', async () => {
    vi.spyOn(db, 'query').mockRejectedValue(new Error('Connection refused'));
    
    await expect(userService.getUserById('123'))
      .rejects.toThrow('Database error');
  });
});
```

### Edge Boundaries
```typescript
describe('validation edge cases', () => {
  it('should reject empty string for name', async () => {
    const input = { email: 'test@example.com', name: '', password: 'Pass123' };
    
    await expect(userService.createUser(input))
      .rejects.toThrow('Name cannot be empty');
  });
  
  it('should reject null values', async () => {
    const input = { email: null, name: 'Test', password: 'Pass123' };
    
    await expect(userService.createUser(input))
      .rejects.toThrow('Email is required');
  });
  
  it('should handle maximum length boundary', async () => {
    const maxLengthName = 'a'.repeat(101); // Assuming max is 100
    const input = { email: 'test@example.com', name: maxLengthName, password: 'Pass123' };
    
    await expect(userService.createUser(input))
      .rejects.toThrow('Name exceeds maximum length');
  });
  
  it('should handle empty array', async () => {
    const result = await userService.getUsersByIds([]);
    expect(result).toEqual([]);
  });
});
```

## Mocking Guidelines

### Mock External Services
```typescript
import { vi } from 'vitest';

// Mock entire module
vi.mock('$lib/server/email', () => ({
  EmailService: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue(true)
  }))
}));

// Mock specific function
const mockSendEmail = vi.fn();
vi.spyOn(emailService, 'send').mockImplementation(mockSendEmail);
```

### Don't Mock Internal Logic
```typescript
// ❌ Avoid mocking internal business logic
vi.mock('./user.service', () => ({
  validateUser: vi.fn().mockReturnValue(true)
}));

// ✅ Test actual implementation
const result = userService.validateUser(userData);
expect(result).toBe(true);
```

## Test Isolation

### Setup and Teardown
```typescript
describe('UserService', () => {
  let userService: UserService;
  let mockRepository: MockRepository;
  
  beforeEach(() => {
    mockRepository = createMockRepository();
    userService = new UserService(mockRepository);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  it('should create user', async () => {
    // Test implementation
  });
});
```

### Database Tests
```typescript
// Use test database or in-memory database
beforeAll(async () => {
  await setupTestDatabase();
});

afterAll(async () => {
  await teardownTestDatabase();
});

beforeEach(async () => {
  await clearDatabase();
});
```

## Coverage Metrics

### Scope Expectations
- **Services**: All public methods covered
- **Routes/API handlers**: Success and failure responses covered
- **Utilities**: All exported functions covered, including edge cases
- **Components**: User interactions and edge-state rendering covered

### Running Coverage
```bash
# Run tests with coverage
pnpm test:coverage

# View coverage report
open coverage/index.html
```

## Best Practices

1. **Behavior-Driven Assertions** - Test behavior, not implementation details
2. **Deterministic Tests** - Tests should produce same results every time
3. **Isolated Tests** - Tests should not depend on each other
4. **Fast Tests** - Mock slow operations (network, database)
5. **Readable Tests** - Clear test names and structure
6. **Maintainable Tests** - Easy to update when requirements change

## Related Documentation

- [Coding Standards](./coding-standards.md)
- [Core Principles](../core-principles.md)
- [API Conventions](./api-conventions.md)
