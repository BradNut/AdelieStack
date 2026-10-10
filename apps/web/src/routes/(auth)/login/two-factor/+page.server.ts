import { redirect } from 'sveltekit-flash-message/server';
import { alreadySignedInMessage } from '$lib/utils/flashMessages';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  if (event.locals.user) {
    throw redirect('/', alreadySignedInMessage, event);
  }
};
