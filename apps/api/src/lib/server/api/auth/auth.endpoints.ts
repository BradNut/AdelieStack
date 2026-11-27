/**
 * Better Auth endpoint paths, relative to the auth basePath, for the hooks and guards that act on them. Better Auth
 * owns these names, so an upgrade that renames one changes it here only. (`packages/shared` lists the client-visible
 * ones for captcha and rate limits.)
 */
export const AuthEndpoint = {
  SIGN_UP_EMAIL: '/sign-up/email',
  SIGN_IN_EMAIL: '/sign-in/email',
  SIGN_IN_SOCIAL: '/sign-in/social',
  SOCIAL_CALLBACK: '/callback/:id',
  PASSKEY_VERIFY_AUTHENTICATION: '/passkey/verify-authentication',
  PASSKEY_VERIFY_REGISTRATION: '/passkey/verify-registration',
  CHANGE_PASSWORD: '/change-password',
  CHANGE_EMAIL: '/change-email',
  RESET_PASSWORD: '/reset-password',
  VERIFY_EMAIL: '/verify-email',
  VERIFY_BACKUP_CODE: '/two-factor/verify-backup-code',
  GENERATE_BACKUP_CODES: '/two-factor/generate-backup-codes',
  TWO_FACTOR_DISABLE: '/two-factor/disable',
  PASSKEY_DELETE: '/passkey/delete-passkey',
  UNLINK_ACCOUNT: '/unlink-account',
  ADMIN_CREATE_USER: '/admin/create-user',
  ADMIN_SET_USER_PASSWORD: '/admin/set-user-password',
  ADMIN_SET_ROLE: '/admin/set-role',
  ADMIN_UPDATE_USER: '/admin/update-user',
  ADMIN_BAN_USER: '/admin/ban-user',
  ADMIN_UNBAN_USER: '/admin/unban-user',
  ADMIN_REMOVE_USER: '/admin/remove-user',
  ADMIN_IMPERSONATE_USER: '/admin/impersonate-user',
  ADMIN_REVOKE_USER_SESSION: '/admin/revoke-user-session',
  ADMIN_REVOKE_USER_SESSIONS: '/admin/revoke-user-sessions',
  ADMIN_GET_USER: '/admin/get-user',
  ADMIN_LIST_USERS: '/admin/list-users',
  ADMIN_LIST_USER_SESSIONS: '/admin/list-user-sessions',
  ADMIN_HAS_PERMISSION: '/admin/has-permission',
  ADMIN_STOP_IMPERSONATING: '/admin/stop-impersonating',
} as const;
