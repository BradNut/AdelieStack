/** Better Auth error codes the web app shows its own copy for. */
export const AuthErrorCode = {
  SIGN_UP_DISABLED: 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
} as const;
export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

export const SIGN_UP_CLOSED_MESSAGE = 'Registration is closed. Ask an administrator to create an account for you.';

/** User-facing copy by Better Auth error code, in place of the server's English message. */
export const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  [AuthErrorCode.SIGN_UP_DISABLED]: SIGN_UP_CLOSED_MESSAGE,
};
