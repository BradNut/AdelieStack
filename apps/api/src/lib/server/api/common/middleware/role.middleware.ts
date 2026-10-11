import { RoleName } from '@adelie/shared';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { rolesOf } from '../../auth/roles';
import { m } from '../i18n';
import { assertSignedIn } from '../utils/assert-signed-in';
import { Forbidden } from '../utils/exceptions';
import type { HonoEnv } from '../utils/hono';

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
