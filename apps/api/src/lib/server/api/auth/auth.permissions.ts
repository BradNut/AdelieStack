import { RoleName } from '@adelie/shared';
import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access';

/** Permission statements for the admin plugin: Better Auth's defaults for users and sessions. */
export const ac = createAccessControl(defaultStatements);

/**
 * The three roles. `admin` gets every admin-plugin permission. `support` and `user` get none:
 * support staff reach only the shared admin-and-support API routes (see `role.middleware.ts`),
 * never the admin plugin's own endpoints (user lookup, session list or revoke, ban, ...).
 */
export const roles = {
  [RoleName.ADMIN]: ac.newRole(adminAc.statements),
  [RoleName.SUPPORT]: ac.newRole(userAc.statements),
  [RoleName.USER]: ac.newRole(userAc.statements),
};
