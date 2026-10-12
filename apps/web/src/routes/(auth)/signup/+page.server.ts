import { redirect } from 'sveltekit-flash-message/server';
import { alreadySignedInMessage, signUpClosedMessage } from '$lib/utils/flashMessages';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  if (event.locals.user) {
    throw redirect('/', alreadySignedInMessage, event);
  }

  const { signUpEnabled } = await event.parent();
  if (!signUpEnabled) {
    throw redirect('/login', signUpClosedMessage, event);
  }
};
