import { AppRoute, isSocialAuthErrorCode, SocialAuthErrorCode, type SocialProvider } from '@adelie/shared';
import { authClient } from '#lib/auth-client.ts';
import { toastIfError } from '#lib/client/auth-form.ts';
import { redirectBrowser } from '#lib/client/browser-redirect.ts';
import { clearPendingReauth, type ReplayRequest, savePendingReauth } from '#lib/client/reauth-replay.svelte.ts';
import * as m from '#lib/paraglide/messages.js';
import type { Locale } from '#lib/paraglide/runtime.js';

/** Query parameter Better Auth adds to the error callback URL when a provider sign-in or link fails. */
export const SOCIAL_ERROR_PARAM = 'error';

/** Asks the provider to show its account chooser, so a leftover provider session cannot confirm for someone else. */
const PROVIDER_PROMPT_PARAM = 'prompt';
const PROVIDER_PROMPT_SELECT_ACCOUNT = 'select_account';

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

/** True for a same-origin relative path; protocol-relative (`//host`) and backslash forms are refused. */
export function isInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\');
}

/** The path and query of the current page without a provider `?error=`, always an app-internal relative path. */
export function currentReturnPath(location: Pick<Location, 'pathname' | 'search'>): string {
  const params = new URLSearchParams(location.search);
  params.delete(SOCIAL_ERROR_PARAM);
  const query = params.toString();
  const path = `${location.pathname}${query ? `?${query}` : ''}`;
  return isInternalPath(path) ? path : AppRoute.HOME;
}

interface ReauthWithProvider {
  email: string;
  userId: string;
  /** The stale action to run again on return, or null when it cannot be replayed. */
  replay: ReplayRequest | null;
}

/**
 * Re-authenticates with the provider and comes back to the current page. The pending entry is stored first, because
 * the navigation reloads the app. Resolves with the error to show, or null once the browser is on its way.
 */
export async function reauthenticateWithProvider(
  provider: SocialProvider,
  { email, userId, replay }: ReauthWithProvider,
): Promise<{ message: string } | null> {
  const returnTo = currentReturnPath(window.location);
  savePendingReauth(replay, userId);
  // Better Auth's sign-in body has no `prompt`, so it returns the authorize URL and the browser is sent there below.
  const { data, error } = await authClient.signIn.social({
    provider,
    loginHint: email,
    callbackURL: returnTo,
    errorCallbackURL: returnTo,
    disableRedirect: true,
  });
  if (error || !data?.url) {
    clearPendingReauth();
    return { message: m.auth_social_error_fallback() };
  }
  const authorizeUrl = new URL(data.url);
  authorizeUrl.searchParams.set(PROVIDER_PROMPT_PARAM, PROVIDER_PROMPT_SELECT_ACCOUNT);
  redirectBrowser(authorizeUrl.toString());
  return null;
}
