import { StatusCodes, updateProfileDto } from '@adelie/shared';
import { type Actions, fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, setError, superValidate } from 'sveltekit-superforms/server';
import { notSignedInMessage } from '$lib/utils/flashMessages';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const { parent } = event;
  const { authedUser } = await parent();

  console.log('authedUser', authedUser);

  if (!authedUser) {
    throw redirect(302, '/login', notSignedInMessage, event);
  }

  const updateProfileForm = await superValidate(event, zod4(updateProfileDto), {
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

    const form = await superValidate(event, zod4(updateProfileDto));

    if (!form.valid) {
      return fail(400, {
        form,
      });
    }

    console.log('form data', form.data);

    const { error } = await locals.api.users.me.profile.$put({ json: form.data }).then(locals.parseApiResponse);

    if (error) {
      console.log('error', error);
      return setError(form, 'username', typeof error === 'string' ? error : 'An error occurred');
    }

    const profileUpdatedMessage = {
      type: 'success' as const,
      text: 'Profile updated! 🎊',
    };

    return message(form, profileUpdatedMessage);
  },
  deleteAccount: async (event) => {
    const { locals } = event;
    const authedUser = await locals.getAuthedUser();

    if (!authedUser) {
      throw redirect(302, '/login', notSignedInMessage, event);
    }

    const { error } = await locals.api.users.me.$delete().then(locals.parseApiResponse);

    if (error) {
      console.log('error', error);
    }

    const accountDeletedMessage = {
      type: 'success' as const,
      text: 'Account deleted! 🎊',
    };
    redirect(StatusCodes.SEE_OTHER, '/');
  },
};
