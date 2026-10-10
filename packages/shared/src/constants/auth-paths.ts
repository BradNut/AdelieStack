/** Web pages Better Auth redirects to after following an emailed link. Each reads `?error=` on failure. */
export const AuthCallbackPath = {
  EMAIL_VERIFIED: '/email-verified',
  EMAIL_CHANGED: '/email-changed',
} as const;
