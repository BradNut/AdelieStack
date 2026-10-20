/** Better Auth error codes the web app shows its own copy for. */
export const AuthErrorCode = {
  SIGN_UP_DISABLED: 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
  /** A sensitive action (unlink account, list sessions) on a session older than `AUTH_SESSION_FRESH_AGE`. */
  SESSION_NOT_FRESH: 'SESSION_NOT_FRESH',
  /** The Two-factor Challenge cookie is missing, expired or already used, so the challenge cannot be completed. */
  TWO_FACTOR_CHALLENGE_INVALID: 'INVALID_TWO_FACTOR_COOKIE',
  /**
   * Too many wrong codes. From an authenticator or recovery code, the Two-factor Challenge used up its attempts and
   * Better Auth discarded it; from an emailed code, only that code is used up and a new one can be requested.
   */
  TWO_FACTOR_ATTEMPTS_EXHAUSTED: 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE',
  /** The emailed two-factor code expired, was used up, or was never sent; the challenge itself is still valid. */
  TWO_FACTOR_EMAILED_CODE_EXPIRED: 'OTP_HAS_EXPIRED',
  /** Too many wrong codes across challenges; two-factor verification is locked for a while. */
  TWO_FACTOR_LOCKED: 'ACCOUNT_TEMPORARILY_LOCKED',
} as const;
export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

export const SIGN_UP_CLOSED_MESSAGE = 'Registration is closed. Ask an administrator to create an account for you.';

/** User-facing copy by Better Auth error code, in place of the server's English message. */
export const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  [AuthErrorCode.SIGN_UP_DISABLED]: SIGN_UP_CLOSED_MESSAGE,
};

/** `providerId` of the account row Better Auth keeps for email and password sign-in. */
export const CREDENTIAL_PROVIDER_ID = 'credential';
