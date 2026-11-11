import { AuthErrorCode } from '@adelie/shared';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { m } from '#lib/server/api/common/i18n/index';
import { Forbidden } from '#lib/server/api/common/utils/exceptions';
import type { HonoEnv } from '#lib/server/api/common/utils/hono';
import { assertSignedIn } from './assert-signed-in';
import type { ac } from './auth.permissions';
import { rolesNeedSecondFactor } from './auth.second-factor';
import type { AuthService } from './auth.service';
import type { RolesService } from './roles';

type Statements = (typeof ac)['statements'];

/** Permissions to require, keyed by resource as in `auth.permissions.ts` (e.g. `{ user: ['list'] }`); typos fail to compile. */
export type RequiredPermissions = { [Resource in keyof Statements]?: Statements[Resource][number][] };

/**
 * Allows the request only when the signed-in user's narrowed roles grant `permissions`; 401 signed
 * out, 403 otherwise. When only roles that need a Second Factor grant `permissions` (an admin capability), the account
 * must also have one, else 403 with `SECOND_FACTOR_REQUIRED` (ADR 0014). Relies on `authSession` having set `c.var.user`. Routes name permissions, never roles: the role-to-permission mapping lives
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
    const roles = rolesService.rolesOf(user);
    const checks = await Promise.all(roles.map((role) => authService.auth.api.userHasPermission({ body: { role, permissions } })));
    const granting = roles.filter((_, index) => checks[index]?.success);
    if (granting.length === 0) {
      throw Forbidden(m.auth_role_forbidden());
    }
    // A role that grants this without a Second Factor is enough, so no other role is held to the admin rule.
    const onlySecondFactorRolesGrant = granting.every((role) => rolesNeedSecondFactor([role]));
    if (onlySecondFactorRolesGrant && !(await authService.hasSecondFactor(user))) {
      throw Forbidden(m.auth_second_factor_required(), AuthErrorCode.SECOND_FACTOR_REQUIRED);
    }
    await next();
  });
}
