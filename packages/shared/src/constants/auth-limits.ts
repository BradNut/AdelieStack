/** NIST SP 800-63B-4: 15 characters when a password may be the only factor. Applies to new passwords only; sign-in does not enforce it. */
export const MIN_PASSWORD_LENGTH = 15 as const;
export const MAX_PASSWORD_LENGTH = 128 as const;

export const MAX_EMAIL_LENGTH = 64 as const;

export const MIN_USERNAME_LENGTH = 3 as const;
export const MAX_USERNAME_LENGTH = 50 as const;

export const MIN_NAME_LENGTH = 1 as const;
export const MAX_NAME_LENGTH = 50 as const;

export const VERIFICATION_CODE_LENGTH = 6 as const;
