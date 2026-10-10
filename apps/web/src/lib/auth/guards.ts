import type { AuthedUser, RoleName } from '@adelie/shared';

export const RouteAccess = {
  ALLOWED: 'allowed',
  SIGN_IN: 'sign-in',
  FORBIDDEN: 'forbidden',
} as const;

export type RouteAccess = (typeof RouteAccess)[keyof typeof RouteAccess];

/** Decides whether `user` may open a route, optionally restricted to `roles`. */
export function evaluateRouteAccess(user: AuthedUser | null, roles?: readonly RoleName[]): RouteAccess {
  if (!user) return RouteAccess.SIGN_IN;
  if (roles && !roles.includes(user.role)) return RouteAccess.FORBIDDEN;
  return RouteAccess.ALLOWED;
}
