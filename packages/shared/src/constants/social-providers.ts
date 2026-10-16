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
 * `?error=` codes Better Auth redirects to when a social sign-in or link fails. The copy for each lives in the
 * web's translated messages (`auth_social_error_<code>`); codes not listed here get a generic message.
 */
export const SocialAuthErrorCode = {
  SIGNUP_DISABLED: 'signup_disabled',
  ACCOUNT_NOT_LINKED: 'account_not_linked',
  EMAIL_NOT_VERIFIED: 'email_not_verified',
  EMAIL_DOES_NOT_MATCH: 'email_does_not_match',
  ACCOUNT_ALREADY_LINKED_TO_DIFFERENT_USER: 'account_already_linked_to_different_user',
  UNABLE_TO_LINK_ACCOUNT: 'unable_to_link_account',
  EMAIL_NOT_FOUND: 'email_not_found',
} as const;
export type SocialAuthErrorCode = (typeof SocialAuthErrorCode)[keyof typeof SocialAuthErrorCode];

export function isSocialAuthErrorCode(code: string): code is SocialAuthErrorCode {
  return (Object.values(SocialAuthErrorCode) as string[]).includes(code);
}
