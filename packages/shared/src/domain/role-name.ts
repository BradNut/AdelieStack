export const RoleName = {
  ADMIN: 'admin',
  SUPPORT: 'support',
  USER: 'user',
} as const;

export type RoleName = (typeof RoleName)[keyof typeof RoleName];
