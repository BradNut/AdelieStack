import { AppRoute } from '@adelie/shared';
import { redirect } from 'sveltekit-flash-message/server';
import { alreadySignedInMessage, signUpClosedMessage } from '$lib/utils/flashMessages';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  if (event.locals.user) {
    throw redirect(AppRoute.HOME, alreadySignedInMessage, event);
  }

  const { signUpEnabled } = await event.parent();
  if (!signUpEnabled) {
    throw redirect(AppRoute.LOGIN, signUpClosedMessage, event);
  }
};
