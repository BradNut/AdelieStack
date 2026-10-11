import { APIError, createAuthMiddleware } from 'better-auth/api';
import { m } from '../../../paraglide/messages';

/** Admin endpoints that write a user's role. */
export const RoleWritePath = {
  SET_ROLE: '/admin/set-role',
  CREATE_USER: '/admin/create-user',
  UPDATE_USER: '/admin/update-user',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function writtenRole(path: string, body: unknown): unknown {
  if (!isRecord(body)) return undefined;
  if (path === RoleWritePath.UPDATE_USER) {
    return isRecord(body.data) ? body.data.role : undefined;
  }
  return body.role;
}

/**
 * Before hook that rejects an array of several roles on the admin role-writing paths while the
 * switch is off. Better Auth already rejects comma-joined strings and unknown names, so arrays are the
 * only multi-role input. The read-side counterpart of this rule is `resolveRoles` in `roles.ts`. The switch is read per request so env stays lazy.
 */
export function createRoleGuard(allowMultipleRoles: () => boolean) {
  return createAuthMiddleware(async (ctx) => {
    if (!Object.values<string>(RoleWritePath).includes(ctx.path)) return;
    const role = writtenRole(ctx.path, ctx.body);
    if (Array.isArray(role) && role.length > 1 && !allowMultipleRoles()) {
      throw new APIError('BAD_REQUEST', { message: m.auth_multiple_roles_disabled() });
    }
  });
}
