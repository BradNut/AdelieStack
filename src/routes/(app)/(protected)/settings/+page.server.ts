import { notSignedInMessage } from '$lib/utils/flashMessages';
import { redirect } from 'sveltekit-flash-message/server';
import type { PageServerLoad } from './$types';
import { fail, message, setError, superValidate } from 'sveltekit-superforms/server';
import { zod } from 'sveltekit-superforms/adapters';
import { updateProfileDto } from '$lib/dtos/settings/profile/update-profile.dto';
import type { Actions } from '@sveltejs/kit';

export const load: PageServerLoad = async (event) => {
  const { parent } = event;
  const { authedUser } = await parent();

  console.log('authedUser', authedUser);

  if (!authedUser) {
    throw redirect(302, '/login', notSignedInMessage, event);
  }

  const updateProfileForm = await superValidate(zod(updateProfileDto), {
    defaults: {
      first_name: authedUser?.first_name ?? '',
      last_name: authedUser?.last_name ?? '',
      username: authedUser?.username ?? '',
    },
  });

  return {
    updateProfileForm,
  };
};

export const actions: Actions = {
  updateProfile: async (event) => {
    const { locals } = event;
    const authedUser = await locals.getAuthedUser();

    if (!authedUser) {
      throw redirect(302, '/login', notSignedInMessage, event);
    }

    const form = await superValidate(event, zod(updateProfileDto));

    if (!form.valid) {
      return fail(400, {
        form,
      });
    }

    console.log('form data', form.data);

    const { error } = await locals.api.users.me.profile.$put({ json: form.data }).then(locals.parseApiResponse);

    if (error) {
      return setError(form, 'username', error);
    }

    return message(form, { text: 'Profile updated', type: 'success' });
  },
};
