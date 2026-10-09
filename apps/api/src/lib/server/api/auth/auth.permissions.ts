import { RoleName } from '@adelie/shared';
import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access';

/** Permission statements for the admin plugin: Better Auth's defaults for users and sessions. */
export const ac = createAccessControl(defaultStatements);

/**
 * The three roles. `admin` gets every admin-plugin permission. `support` can look users and
 * their sessions up and revoke a session, but cannot create, ban, delete, impersonate, or
 * change roles or credentials. `user` has no admin-plugin permissions.
 */
export const roles = {
  [RoleName.ADMIN]: ac.newRole(adminAc.statements),
  [RoleName.SUPPORT]: ac.newRole({
    user: ['list', 'get'],
    session: ['list', 'revoke'],
  }),
  [RoleName.USER]: ac.newRole(userAc.statements),
};
