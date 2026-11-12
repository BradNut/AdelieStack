/** Better Auth error codes the web app shows its own copy for. */
export const AuthErrorCode = {
  SIGN_UP_DISABLED: 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
  /** A sensitive action (unlink account, list sessions, change email) on a session older than `AUTH_SESSION_FRESH_AGE`. */
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
  /**
   * Our own code, not Better Auth's: too many failed password sign-ins for this email address from any client
   * (`AUTH_ACCOUNT_SIGN_IN_LOCKOUT`), so password sign-in waits. Answered whether or not an account has the address.
   */
  SIGN_IN_LOCKED: 'SIGN_IN_TEMPORARILY_LOCKED',
  /** Our own code, not Better Auth's: the Password Account cannot be unlinked while two-factor is enabled (ADR 0008). */
  PASSWORD_REQUIRED_FOR_TWO_FACTOR: 'PASSWORD_REQUIRED_FOR_TWO_FACTOR',
  /**
   * Our own code: the account holds a role whose capabilities need a Second Factor (a passkey or enabled two-factor)
   * and has none, so the admin capability was refused. Signing in and enrolling still work (ADR 0014).
   */
  SECOND_FACTOR_REQUIRED: 'SECOND_FACTOR_REQUIRED',
  /** Our own code: removing this would leave an account that needs a Second Factor without one (ADR 0014). */
  LAST_SECOND_FACTOR: 'LAST_SECOND_FACTOR',
  /** Our own code: an admin create or update tried to set a Second Factor field, which only its owner enrols (ADR 0014). */
  SECOND_FACTOR_NOT_WRITABLE: 'SECOND_FACTOR_NOT_WRITABLE',
} as const;
export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

export const SIGN_UP_CLOSED_MESSAGE = 'Registration is closed. Ask an administrator to create an account for you.';

export const SECOND_FACTOR_REQUIRED_MESSAGE = 'Admin access needs a second factor. Turn on two-factor or add a passkey to continue.';

export const LAST_SECOND_FACTOR_MESSAGE = 'Admins must keep a second factor. Add a passkey or turn on two-factor before removing this one.';

/** User-facing copy by Better Auth error code, in place of the server's English message. */
export const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  [AuthErrorCode.SIGN_UP_DISABLED]: SIGN_UP_CLOSED_MESSAGE,
  [AuthErrorCode.SECOND_FACTOR_REQUIRED]: SECOND_FACTOR_REQUIRED_MESSAGE,
  [AuthErrorCode.LAST_SECOND_FACTOR]: LAST_SECOND_FACTOR_MESSAGE,
};

/** `providerId` of the account row Better Auth keeps for email and password sign-in. */
export const CREDENTIAL_PROVIDER_ID = 'credential';
