import { RoleName } from '@adelie/shared';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AuthUser } from '../../auth/auth.config';
import { m } from '../i18n';
import { assertSignedIn } from '../utils/assert-signed-in';
import { Forbidden } from '../utils/exceptions';
import type { HonoEnv } from '../utils/hono';

const ROLE_NAMES: readonly string[] = Object.values(RoleName);

function isRoleName(role: string): role is RoleName {
  return ROLE_NAMES.includes(role);
}

/** Better Auth's admin plugin stores several roles as one comma-separated string. */
function rolesOf(user: AuthUser): RoleName[] {
  return (user.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .filter(isRoleName);
}

/** Allows the request only when the signed-in user holds one of `allowed`; 401 signed out, 403 otherwise. */
function requireRole(...allowed: RoleName[]): MiddlewareHandler<HonoEnv> {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const user = c.var.user;
    assertSignedIn(user);
    if (!rolesOf(user).some((role) => allowed.includes(role))) {
      throw Forbidden(m.auth_role_forbidden());
    }
    await next();
  });
}

/** Admin routes. */
export const adminRoleOnly = requireRole(RoleName.ADMIN);

/** Routes shared by admin and support staff. */
export const adminAndSupportRoleOnly = requireRole(RoleName.ADMIN, RoleName.SUPPORT);
