import { AppRoute, isSocialAuthErrorCode, SocialAuthErrorCode, type SocialProvider } from '@adelie/shared';
import { authClient } from '#lib/auth-client.ts';
import { toastIfError } from '#lib/client/auth-form.ts';
import * as m from '#lib/paraglide/messages.js';
import type { Locale } from '#lib/paraglide/runtime.js';

/** Query parameter Better Auth adds to the error callback URL when a provider sign-in or link fails. */
export const SOCIAL_ERROR_PARAM = 'error';

type MessageOptions = { locale?: Locale };

/** Translated copy per `?error=` code; every code in {@link SocialAuthErrorCode} needs an entry. */
const SOCIAL_AUTH_ERRORS: Record<SocialAuthErrorCode, (inputs: Record<string, never>, options?: MessageOptions) => string> = {
  [SocialAuthErrorCode.SIGNUP_DISABLED]: m.auth_social_error_signup_disabled,
  [SocialAuthErrorCode.ACCOUNT_NOT_LINKED]: m.auth_social_error_account_not_linked,
  [SocialAuthErrorCode.EMAIL_NOT_VERIFIED]: m.auth_social_error_email_not_verified,
  [SocialAuthErrorCode.EMAIL_DOES_NOT_MATCH]: m.auth_social_error_email_does_not_match,
  [SocialAuthErrorCode.ACCOUNT_ALREADY_LINKED_TO_DIFFERENT_USER]: m.auth_social_error_account_already_linked_to_different_user,
  [SocialAuthErrorCode.UNABLE_TO_LINK_ACCOUNT]: m.auth_social_error_unable_to_link_account,
  [SocialAuthErrorCode.EMAIL_NOT_FOUND]: m.auth_social_error_email_not_found,
};

/** Translated copy for the `?error=` code Better Auth redirected back with, or null when the URL carries none. */
export function socialErrorMessage(code: string | null | undefined, options: MessageOptions = {}): string | null {
  if (!code) return null;
  if (!isSocialAuthErrorCode(code)) return m.auth_social_error_fallback({}, options);
  return SOCIAL_AUTH_ERRORS[code]({}, options);
}

/**
 * Sends the browser to the provider; it returns signed in to `/`, or to `/login?error=...` when refused. Errors
 * always come back to the login page, even when the attempt started on sign-up, so only the login page shows them.
 */
export async function signInWithProvider(provider: SocialProvider): Promise<void> {
  const { error } = await authClient.signIn.social({ provider, callbackURL: AppRoute.HOME, errorCallbackURL: AppRoute.LOGIN });
  toastIfError(error, m.auth_social_error_fallback());
}

/** Sends the signed-in browser to the provider to link it; it returns to `returnTo`, with `?error=` when refused. */
export async function linkProvider(provider: SocialProvider, returnTo: string): Promise<void> {
  const { error } = await authClient.linkSocial({ provider, callbackURL: returnTo, errorCallbackURL: returnTo });
  toastIfError(error, m.auth_social_error_fallback());
}
