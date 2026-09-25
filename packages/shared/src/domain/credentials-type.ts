export const CredentialsType = {
  PASSWORD: 'password',
  PASSKEY: 'passkey',
  SECURITY_KEY: 'security-key',
  TOTP: 'totp',
} as const;

export type CredentialsType = (typeof CredentialsType)[keyof typeof CredentialsType];

export const MfaCredentialsType = {
  PASSKEY: CredentialsType.PASSKEY,
  SECURITY_KEY: CredentialsType.SECURITY_KEY,
  TOTP: CredentialsType.TOTP,
} as const;

export type MfaCredentialsType = (typeof MfaCredentialsType)[keyof typeof MfaCredentialsType];
