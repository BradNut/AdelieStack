export const RoleName = {
  ADMIN: 'admin',
  SUPPORT: 'support',
  USER: 'user',
} as const;

export type RoleName = (typeof RoleName)[keyof typeof RoleName];

/**
 * Roles whose capabilities need a Second Factor: a registered passkey or enabled two-factor. The check guards the
 * capabilities, not sign-in, so an account holding one of these roles can still sign in and enrol (ADR 0014).
 */
export const SECOND_FACTOR_ROLES: readonly RoleName[] = [RoleName.ADMIN];
