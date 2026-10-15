/** Social login providers. The value is the Better Auth provider id. */
export const SocialProvider = {
  GITHUB: 'github',
  GOOGLE: 'google',
} as const;
export type SocialProvider = (typeof SocialProvider)[keyof typeof SocialProvider];

export const SOCIAL_PROVIDERS = Object.values(SocialProvider) as [SocialProvider, ...SocialProvider[]];

/** Provider names as shown on buttons and in account settings. */
export const SOCIAL_PROVIDER_LABELS: Readonly<Record<SocialProvider, string>> = {
  [SocialProvider.GITHUB]: 'GitHub',
  [SocialProvider.GOOGLE]: 'Google',
};

/**
 * `?error=` codes Better Auth redirects to when a social sign-in or link fails, with the copy to show.
 * Codes not listed here fall back to a generic message.
 */
export const SOCIAL_AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  signup_disabled: 'Registration is closed. Ask an administrator to create an account for you.',
  account_not_linked: 'An account with this email already exists. Sign in the usual way and link the provider from your account settings.',
  email_not_verified: 'Verify your email address with the provider first, then try again.',
  email_does_not_match: 'The provider account uses a different email address than your account.',
  account_already_linked_to_different_user: 'That provider account is already linked to another user.',
  unable_to_link_account: 'The provider account could not be linked.',
  email_not_found: 'The provider did not share an email address.',
};

export const SOCIAL_AUTH_ERROR_FALLBACK = 'Sign-in with the provider failed. Please try again.';
