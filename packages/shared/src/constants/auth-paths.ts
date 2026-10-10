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
