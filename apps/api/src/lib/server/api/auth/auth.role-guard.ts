import { APIError, createAuthMiddleware } from 'better-auth/api';

/** Admin endpoints that write a user's role. */
export const RoleWritePath = {
  SET_ROLE: '/admin/set-role',
  CREATE_USER: '/admin/create-user',
  UPDATE_USER: '/admin/update-user',
} as const;

export const MULTIPLE_ROLES_DISABLED_MESSAGE = 'Assigning more than one role is disabled (ALLOW_MULTIPLE_ROLES is off)';

function writtenRole(path: string, body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return undefined;
  if (path === RoleWritePath.UPDATE_USER) {
    const data = (body as { data?: unknown }).data;
    return typeof data === 'object' && data !== null ? (data as { role?: unknown }).role : undefined;
  }
  return (body as { role?: unknown }).role;
}

/**
 * Before hook that rejects an array of several roles on the admin role-writing paths while the
 * switch is off. Better Auth already rejects comma-joined strings and unknown names, so arrays are the
 * only multi-role input. The switch is read per request so env stays lazy.
 */
export function createRoleGuard(allowMultipleRoles: () => boolean) {
  return createAuthMiddleware(async (ctx) => {
    if (!Object.values<string>(RoleWritePath).includes(ctx.path)) return;
    const role = writtenRole(ctx.path, ctx.body);
    if (Array.isArray(role) && role.length > 1 && !allowMultipleRoles()) {
      throw new APIError('BAD_REQUEST', { message: MULTIPLE_ROLES_DISABLED_MESSAGE });
    }
  });
}
