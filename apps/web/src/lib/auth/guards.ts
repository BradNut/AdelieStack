import { type AuthedUser, type RoleName, roleNeedsSecondFactor } from '@adelie/shared';

export const RouteAccess = {
  ALLOWED: 'allowed',
  SIGN_IN: 'sign-in',
  FORBIDDEN: 'forbidden',
  /** Signed in with the role, but the role needs a Second Factor the account has not enrolled (ADR 0014). */
  ENROL_SECOND_FACTOR: 'enrol-second-factor',
} as const;

export type RouteAccess = (typeof RouteAccess)[keyof typeof RouteAccess];

/** True when any of the user's roles is in `allowed`. */
export function hasAnyRole(user: AuthedUser, allowed: readonly RoleName[]): boolean {
  return user.roles.some((role) => allowed.includes(role));
}

/**
 * Decides whether `user` may open a route, optionally restricted to `roles`; any one of the user's roles is enough.
 * When only roles that need a Second Factor open it and the user has none, they are sent to enrol instead.
 */
export function evaluateRouteAccess(user: AuthedUser | null, roles?: readonly RoleName[]): RouteAccess {
  if (!user) return RouteAccess.SIGN_IN;
  if (!roles) return RouteAccess.ALLOWED;
  const opening = user.roles.filter((role) => roles.includes(role));
  if (opening.length === 0) return RouteAccess.FORBIDDEN;
  const onlySecondFactorRolesOpen = opening.every(roleNeedsSecondFactor);
  if (onlySecondFactorRolesOpen && user.needsSecondFactor) return RouteAccess.ENROL_SECOND_FACTOR;
  return RouteAccess.ALLOWED;
}
