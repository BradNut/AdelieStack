import { type AuthedUser, RoleName } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { evaluateRouteAccess, hasAnyRole, RouteAccess } from '../guards';

const user = (...roles: AuthedUser['roles']): AuthedUser => ({
  id: 'u1',
  email: 'a@example.com',
  name: 'A',
  roles,
  emailVerified: false,
  twoFactorEnabled: false,
  needsSecondFactor: false,
});

/** A user whose roles need a Second Factor they have not enrolled, as `/users/me` reports. */
const unenrolled = (...roles: AuthedUser['roles']): AuthedUser => ({ ...user(...roles), needsSecondFactor: true });

describe('hasAnyRole', () => {
  it('is true when one of several roles is allowed', () => {
    expect(hasAnyRole(user(RoleName.USER, RoleName.ADMIN), [RoleName.ADMIN])).toBe(true);
  });

  it('is false when none of the roles is allowed', () => {
    expect(hasAnyRole(user(RoleName.USER), [RoleName.ADMIN, RoleName.SUPPORT])).toBe(false);
  });

  it('is false when nothing is allowed', () => {
    expect(hasAnyRole(user(RoleName.ADMIN), [])).toBe(false);
  });
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

  it('allows a user when any one of several roles is allowed', () => {
    expect(evaluateRouteAccess(user(RoleName.USER, RoleName.SUPPORT), [RoleName.ADMIN, RoleName.SUPPORT])).toBe(RouteAccess.ALLOWED);
  });

  it('forbids a user none of whose roles is allowed', () => {
    expect(evaluateRouteAccess(user(RoleName.USER, RoleName.SUPPORT), [RoleName.ADMIN])).toBe(RouteAccess.FORBIDDEN);
  });

  it('forbids a signed-in user without the required role', () => {
    expect(evaluateRouteAccess(user(RoleName.USER), [RoleName.ADMIN])).toBe(RouteAccess.FORBIDDEN);
    expect(evaluateRouteAccess(user(RoleName.SUPPORT), [RoleName.ADMIN])).toBe(RouteAccess.FORBIDDEN);
  });

  it('sends an admin without a Second Factor to enrolment on an admin route', () => {
    expect(evaluateRouteAccess(unenrolled(RoleName.ADMIN), [RoleName.ADMIN])).toBe(RouteAccess.ENROL_SECOND_FACTOR);
  });

  it('allows an admin with a Second Factor on an admin route', () => {
    expect(evaluateRouteAccess({ ...user(RoleName.ADMIN), twoFactorEnabled: true }, [RoleName.ADMIN])).toBe(RouteAccess.ALLOWED);
  });

  it('allows an admin without a Second Factor on a route that needs no role', () => {
    expect(evaluateRouteAccess(unenrolled(RoleName.ADMIN))).toBe(RouteAccess.ALLOWED);
  });

  it('allows an unenrolled admin through a route their other, non-admin role opens', () => {
    expect(evaluateRouteAccess(unenrolled(RoleName.ADMIN, RoleName.SUPPORT), [RoleName.ADMIN, RoleName.SUPPORT])).toBe(RouteAccess.ALLOWED);
  });

  it('still forbids a user without the role, whatever their factors', () => {
    expect(evaluateRouteAccess(unenrolled(RoleName.USER), [RoleName.ADMIN])).toBe(RouteAccess.FORBIDDEN);
  });

  it('still sends a signed-out visitor to sign in on a role-gated route', () => {
    expect(evaluateRouteAccess(null, [RoleName.ADMIN])).toBe(RouteAccess.SIGN_IN);
  });
});
