import { TimeSpan } from '../../../../utils/timespan';
import type { CreateSessionDto } from '../../iam/sessions/dtos/create-session-dto';
import { type Credentials, CredentialsType } from '../../users/tables/credentials.table';
import type { User } from '../../users/tables/users.table';

/** Fixed clock for deterministic date assertions; use with `vi.setSystemTime(TEST_NOW)`. */
export const TEST_NOW = new Date('2026-01-15T12:00:00.000Z');

export const TEST_USER_ID = 'user_test_0001';
export const TEST_EMAIL = 'penguin@example.com';

export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: TEST_USER_ID,
    username: 'penguin',
    email: TEST_EMAIL,
    first_name: 'Adelie',
    last_name: 'Penguin',
    email_verified: true,
    mfa_enabled: false,
    avatar: null,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...overrides,
  };
}

export function buildPasswordCredential(overrides: Partial<Credentials> = {}): Credentials {
  return {
    id: 'cred_test_0001',
    user_id: TEST_USER_ID,
    type: CredentialsType.PASSWORD,
    secret_data: 'hashed-password',
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...overrides,
  };
}

export function buildSession(overrides: Partial<CreateSessionDto> = {}): CreateSessionDto {
  return {
    id: 'session_test_0001',
    userId: TEST_USER_ID,
    createdAt: TEST_NOW,
    expiresAt: new Date(TEST_NOW.getTime() + new TimeSpan(30, 'd').milliseconds()),
    ...overrides,
  };
}
