import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { m } from '#lib/server/api/common/i18n/index';
import { isRecord } from '#lib/server/api/common/utils/is-record';
import { AuthEndpoint } from './auth.endpoints';

/** Admin endpoints that write a user's role. */
const ROLE_WRITE_PATHS: readonly string[] = [AuthEndpoint.ADMIN_SET_ROLE, AuthEndpoint.ADMIN_CREATE_USER, AuthEndpoint.ADMIN_UPDATE_USER];

function writtenRole(path: string, body: unknown): unknown {
  if (!isRecord(body)) return undefined;
  if (path === AuthEndpoint.ADMIN_UPDATE_USER) {
    return isRecord(body.data) ? body.data.role : undefined;
  }
  return body.role;
}

/**
 * Rejects an array of several roles on the admin role-writing paths while the switch is off. Better Auth already
 * rejects comma-joined strings and unknown names, so arrays are the only multi-role input. The read-side counterpart
 * of this rule is `resolveRoles` in `roles.ts`. A plugin hook because the top-level `hooks.before` slot is taken by
 * the password policy.
 */
export const roleGuard = (allowMultipleRoles: boolean): BetterAuthPlugin => ({
  id: 'role-guard',
  hooks: {
    before: [
      {
        matcher: (ctx) => ROLE_WRITE_PATHS.includes(ctx.path ?? ''),
        handler: createAuthMiddleware(async (ctx) => {
          const role = writtenRole(ctx.path, ctx.body);
          if (Array.isArray(role) && role.length > 1 && !allowMultipleRoles) {
            throw new APIError('BAD_REQUEST', { message: m.auth_multiple_roles_disabled() });
          }
        }),
      },
    ],
  },
});
