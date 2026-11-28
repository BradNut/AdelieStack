import { AppRoute } from '@adelie/shared';
import { redirect } from 'sveltekit-flash-message/server';
import { alreadySignedInMessage } from '#lib/utils/flashMessages.ts';
import type { PageServerLoad } from './$types';

/**
 * Better Auth's reset link redirects here with `?token=` when valid, or `?error=` when not.
 * A signed-in browser may follow a link too, since a successful reset ends every session of the account.
 */
export const load: PageServerLoad = async (event) => {
  const token = event.url.searchParams.get('token') || null;
  const linkError = event.url.searchParams.get('error') || null;

  if (event.locals.user && !token && !linkError) {
    throw redirect(AppRoute.SETTINGS_PASSWORD, alreadySignedInMessage, event);
  }

  return { token, linkError };
};
