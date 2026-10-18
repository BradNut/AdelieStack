/** Better Auth error codes the web app shows its own copy for. */
export const AuthErrorCode = {
  SIGN_UP_DISABLED: 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
  /** A sensitive action (unlink account, list sessions) on a session older than `AUTH_SESSION_FRESH_AGE`. */
  SESSION_NOT_FRESH: 'SESSION_NOT_FRESH',
} as const;
export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

export const SIGN_UP_CLOSED_MESSAGE = 'Registration is closed. Ask an administrator to create an account for you.';

/** User-facing copy by Better Auth error code, in place of the server's English message. */
export const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  [AuthErrorCode.SIGN_UP_DISABLED]: SIGN_UP_CLOSED_MESSAGE,
};

/** `providerId` of the account row Better Auth keeps for email and password sign-in. */
export const CREDENTIAL_PROVIDER_ID = 'credential';
