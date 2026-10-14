import { loadFlash } from 'sveltekit-flash-message/server';
import { loadSignUpEnabled } from '#lib/server/public-config.js';

export const load = loadFlash(async ({ locals }) => {
  return {
    authedUser: locals.user,
    signUpEnabled: await loadSignUpEnabled(locals.api),
  };
});
