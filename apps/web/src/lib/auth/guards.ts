import type { AuthedUser, RoleName } from '@adelie/shared';

export const RouteAccess = {
  ALLOWED: 'allowed',
  SIGN_IN: 'sign-in',
  FORBIDDEN: 'forbidden',
} as const;

export type RouteAccess = (typeof RouteAccess)[keyof typeof RouteAccess];

/** True when any of the user's roles is in `allowed`. */
export function hasAnyRole(user: AuthedUser, allowed: readonly RoleName[]): boolean {
  return user.roles.some((role) => allowed.includes(role));
}

/** Decides whether `user` may open a route, optionally restricted to `roles`; any one of the user's roles is enough. */
export function evaluateRouteAccess(user: AuthedUser | null, roles?: readonly RoleName[]): RouteAccess {
  if (!user) return RouteAccess.SIGN_IN;
  if (roles && !hasAnyRole(user, roles)) return RouteAccess.FORBIDDEN;
  return RouteAccess.ALLOWED;
}
