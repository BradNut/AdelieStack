export const TOTP_CODE_LENGTH = 6 as const;
export const RECOVERY_CODE_LENGTH = 10 as const;

/** Minutes an emailed two-factor code stays valid. The email copy is written in the plural, so keep this above 1. */
export const TWO_FACTOR_OTP_PERIOD_MINUTES = 5 as const;
