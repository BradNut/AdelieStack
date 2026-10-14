import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ac } from '#lib/server/api/auth/auth.permissions';
import type { AuthService } from '#lib/server/api/auth/auth.service';
import type { RolesService } from '#lib/server/api/auth/roles';
import { m } from '#lib/server/api/common/i18n/index';
import { assertSignedIn } from '#lib/server/api/common/utils/assert-signed-in';
import { Forbidden } from '#lib/server/api/common/utils/exceptions';
import type { HonoEnv } from '#lib/server/api/common/utils/hono';

type Statements = (typeof ac)['statements'];

/** Permissions to require, keyed by resource as in `auth.permissions.ts` (e.g. `{ user: ['list'] }`); typos fail to compile. */
export type RequiredPermissions = { [Resource in keyof Statements]?: Statements[Resource][number][] };

/**
 * Allows the request only when the signed-in user's narrowed roles grant `permissions`; 401 signed
 * out, 403 otherwise. Relies on `authSession` having set `c.var.user`. Routes name permissions, never roles: the role-to-permission mapping lives
 * in `auth.permissions.ts`. Better Auth is given only the narrowed roles and no headers, because
 * with a session present it would ignore a supplied role and use the stored (unnarrowed) value.
 */
export function requirePermission(
  authService: AuthService,
  rolesService: RolesService,
  permissions: RequiredPermissions,
): MiddlewareHandler<HonoEnv> {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const user = c.var.user;
    assertSignedIn(user);
    const checks = await Promise.all(
      rolesService.rolesOf(user).map((role) => authService.auth.api.userHasPermission({ body: { role, permissions } })),
    );
    if (!checks.some(({ success }) => success)) {
      throw Forbidden(m.auth_role_forbidden());
    }
    await next();
  });
}
