/** Prefix of every API route. */
export const API_BASE_PATH = '/api';

/** Path of the auth handler below {@link API_BASE_PATH}; the API routes `${AUTH_ROUTE}/*` to Better Auth. */
export const AUTH_ROUTE = '/auth';

/** Where Better Auth is mounted; the API server and the web auth client both use it as their base path. */
export const AUTH_BASE_PATH = `${API_BASE_PATH}${AUTH_ROUTE}`;

/** Web pages Better Auth redirects to after following an emailed link. Each reads `?error=` on failure. */
export const AuthCallbackPath = {
  EMAIL_VERIFIED: '/email-verified',
  EMAIL_CHANGED: '/email-changed',
} as const;

/** What an emailed link was for; picks the landing page copy and the recovery action. */
export const VerificationKind = {
  VERIFY: 'verify',
  CHANGE: 'change',
} as const;
export type VerificationKind = (typeof VerificationKind)[keyof typeof VerificationKind];
