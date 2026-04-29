// @ts-nocheck
import { notSignedInMessage } from '$lib/utils/flashMessages';
import { redirect } from 'sveltekit-flash-message/server';
import type { PageServerLoad } from './$types';
import { fail, message, setError, superValidate } from 'sveltekit-superforms/server';
import { zod } from 'sveltekit-superforms/adapters';
import { updateProfileDto } from '$lib/dtos/settings/profile/update-profile.dto';
import type { Actions } from '@sveltejs/kit';
import { StatusCodes } from '$lib/constants/status-codes';

export const load = async (event: Parameters<PageServerLoad>[0]) => {
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

export const actions = {
  updateProfile: async (event: import('./$types').RequestEvent) => {
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
			console.log('error', error);
      return setError(form, 'username', error.message);
    }

		const profileUpdatedMessage = {
			type: 'success',
			message: 'Profile updated! 🎊',
		};

    return message(form, profileUpdatedMessage);
  },
  deleteAccount: async (event: import('./$types').RequestEvent) => {
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
      type: 'success',
      message: 'Account deleted! 🎊',
    };
    redirect(StatusCodes.SEE_OTHER, '/')
  }
};
;null as any as Actions;