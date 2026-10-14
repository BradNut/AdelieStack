import { redirect } from 'sveltekit-flash-message/server';
import { SHOW_OAUTH_BUTTONS } from '$app/env/private';
import { alreadySignedInMessage } from '$lib/utils/flashMessages';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  if (event.locals.user) {
    throw redirect('/', alreadySignedInMessage, event);
  }

  return {
    showOAuthButtons: SHOW_OAUTH_BUTTONS === 'true',
  };
};
