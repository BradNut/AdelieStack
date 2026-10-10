import { redirect } from 'sveltekit-flash-message/server';
import { alreadySignedInMessage } from '$lib/utils/flashMessages';
import type { PageServerLoad } from './$types';

/** Better Auth's reset link redirects here with `?token=` when valid, or `?error=` when not. */
export const load: PageServerLoad = async (event) => {
  if (event.locals.user) {
    throw redirect('/', alreadySignedInMessage, event);
  }

  return {
    token: event.url.searchParams.get('token'),
    linkError: event.url.searchParams.get('error'),
  };
};
