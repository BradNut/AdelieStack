import { AppRoute, SOCIAL_AUTH_ERROR_FALLBACK, SOCIAL_AUTH_ERROR_MESSAGES, type SocialProvider } from '@adelie/shared';
import { authClient } from '#lib/auth-client.ts';
import { toastIfError } from '#lib/client/auth-form.ts';

/** Query parameter Better Auth adds to the error callback URL when a provider sign-in or link fails. */
export const SOCIAL_ERROR_PARAM = 'error';

/** Copy for the `?error=` code Better Auth redirected back with, or null when the URL carries none. */
export function socialErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return SOCIAL_AUTH_ERROR_MESSAGES[code] ?? SOCIAL_AUTH_ERROR_FALLBACK;
}

/** Sends the browser to the provider; it returns signed in to `/`, or to `/login?error=...` when refused. */
export async function signInWithProvider(provider: SocialProvider): Promise<void> {
  const { error } = await authClient.signIn.social({ provider, callbackURL: AppRoute.HOME, errorCallbackURL: AppRoute.LOGIN });
  toastIfError(error, SOCIAL_AUTH_ERROR_FALLBACK);
}

/** Sends the signed-in browser to the provider to link it; it returns to `returnTo`, with `?error=` when refused. */
export async function linkProvider(provider: SocialProvider, returnTo: string): Promise<void> {
  const { error } = await authClient.linkSocial({ provider, callbackURL: returnTo, errorCallbackURL: returnTo });
  toastIfError(error, SOCIAL_AUTH_ERROR_FALLBACK);
}
