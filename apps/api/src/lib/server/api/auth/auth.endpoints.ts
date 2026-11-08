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
  RESET_PASSWORD: '/reset-password',
  VERIFY_EMAIL: '/verify-email',
  VERIFY_BACKUP_CODE: '/two-factor/verify-backup-code',
  GENERATE_BACKUP_CODES: '/two-factor/generate-backup-codes',
  UNLINK_ACCOUNT: '/unlink-account',
  ADMIN_CREATE_USER: '/admin/create-user',
  ADMIN_SET_USER_PASSWORD: '/admin/set-user-password',
  ADMIN_SET_ROLE: '/admin/set-role',
  ADMIN_UPDATE_USER: '/admin/update-user',
} as const;
