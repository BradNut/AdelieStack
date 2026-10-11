import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AuthService } from '../../auth/auth.service';
import { rolesOf } from '../../auth/roles';
import { m } from '../i18n';
import { assertSignedIn } from '../utils/assert-signed-in';
import { Forbidden } from '../utils/exceptions';
import type { HonoEnv } from '../utils/hono';

/** Permissions to require, keyed by resource as in `auth.permissions.ts` (e.g. `{ user: ['list'] }`). */
export type RequiredPermissions = Record<string, string[]>;

const ROLE_SEPARATOR = ',';

/**
 * Allows the request only when the signed-in user's narrowed roles grant `permissions`; 401 signed
 * out, 403 otherwise. Routes name permissions, never roles: the role-to-permission mapping lives
 * in `auth.permissions.ts`. Better Auth is given only the narrowed roles and no headers, because
 * with a session present it would ignore a supplied role and use the stored (unnarrowed) value.
 */
export function requirePermission(authService: AuthService, permissions: RequiredPermissions): MiddlewareHandler<HonoEnv> {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const result = await authService.auth.api.getSession({ headers: c.req.raw.headers });
    assertSignedIn(result?.user);
    const role = rolesOf(result.user).join(ROLE_SEPARATOR);
    const { success } = await authService.auth.api.userHasPermission({ body: { role, permissions } });
    if (!success) {
      throw Forbidden(m.auth_role_forbidden());
    }
    await next();
  });
}
