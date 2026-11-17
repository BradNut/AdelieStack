import type { AuthedUser } from '@adelie/shared';

/** A signed-in, verified account holder with no roles, Second Factor or Preferred Language; override what a test needs. */
export function buildAuthedUser(overrides: Partial<AuthedUser> = {}): AuthedUser {
  return {
    id: 'user-1',
    email: 'penguin@example.com',
    name: 'Penguin',
    roles: [],
    emailVerified: true,
    twoFactorEnabled: false,
    needsSecondFactor: false,
    preferredLanguage: null,
    impersonating: false,
    ...overrides,
  };
}
