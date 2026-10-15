import { loadFlash } from 'sveltekit-flash-message/server';
import { loadPublicConfig } from '#lib/server/public-config.ts';

export const load = loadFlash(async ({ locals }) => {
  const { signUpEnabled, socialProviders } = await loadPublicConfig(locals.api);
  return {
    authedUser: locals.user,
    signUpEnabled,
    socialProviders,
  };
});
