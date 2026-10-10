import { type AuthedUser, RoleName } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { evaluateRouteAccess, RouteAccess } from '../guards';

const user = (role: AuthedUser['role']): AuthedUser => ({
  id: 'u1',
  email: 'a@example.com',
  name: 'A',
  role,
  emailVerified: false,
  twoFactorEnabled: false,
});

describe('evaluateRouteAccess', () => {
  it('sends a signed-out visitor to sign in', () => {
    expect(evaluateRouteAccess(null)).toBe(RouteAccess.SIGN_IN);
  });

  it('allows any signed-in user when no role is required', () => {
    expect(evaluateRouteAccess(user(RoleName.USER))).toBe(RouteAccess.ALLOWED);
  });

  it('allows a user holding a required role', () => {
    expect(evaluateRouteAccess(user(RoleName.ADMIN), [RoleName.ADMIN])).toBe(RouteAccess.ALLOWED);
  });

  it('forbids a signed-in user without the required role', () => {
    expect(evaluateRouteAccess(user(RoleName.USER), [RoleName.ADMIN])).toBe(RouteAccess.FORBIDDEN);
    expect(evaluateRouteAccess(user(RoleName.SUPPORT), [RoleName.ADMIN])).toBe(RouteAccess.FORBIDDEN);
  });

  it('still sends a signed-out visitor to sign in on a role-gated route', () => {
    expect(evaluateRouteAccess(null, [RoleName.ADMIN])).toBe(RouteAccess.SIGN_IN);
  });
});
