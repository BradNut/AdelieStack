import { RoleName } from '@adelie/shared';
import type { AuthSession, AuthUser } from '../../auth/auth.config';

/** Fixed clock for deterministic date assertions; use with `vi.setSystemTime(TEST_NOW)`. */
export const TEST_NOW = new Date('2026-01-15T12:00:00.000Z');

export const TEST_USER_ID = '019bc1f2-5a00-7000-8000-000000000001';
export const TEST_EMAIL = 'penguin@example.com';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function buildAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: TEST_USER_ID,
    name: 'Adelie Penguin',
    email: TEST_EMAIL,
    emailVerified: true,
    image: null,
    role: RoleName.USER,
    banned: false,
    banReason: null,
    banExpires: null,
    twoFactorEnabled: false,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...overrides,
  };
}

export function buildAuthSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    id: '019bc1f2-5a00-7000-8000-000000000002',
    token: 'session-token',
    userId: TEST_USER_ID,
    ipAddress: null,
    userAgent: null,
    impersonatedBy: null,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    expiresAt: new Date(TEST_NOW.getTime() + THIRTY_DAYS_MS),
    ...overrides,
  };
}
