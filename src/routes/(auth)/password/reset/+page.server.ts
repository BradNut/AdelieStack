import { notSignedInMessage } from '$lib/utils/flashMessages';
import { StatusCodes } from '$lib/utils/status-codes';
import { resetPasswordEmailDto, resetPasswordTokenDto } from '$lib/dtos/reset-password';
import { fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { zod } from 'sveltekit-superforms/adapters';
import { setError, superValidate } from 'sveltekit-superforms/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  return {
    emailForm: await superValidate(zod(resetPasswordEmailDto)),
    tokenForm: await superValidate(zod(resetPasswordTokenDto)),
  };
};

export const actions = {
  passwordReset: async (event) => {
    const { request, locals } = event;

    const authedUser = await locals.getAuthedUser();
    if (!authedUser) {
      throw redirect(302, '/login', notSignedInMessage, event);
    }

    const emailForm = await superValidate(request, zod(resetPasswordEmailDto));
    if (!emailForm.valid) {
      return fail(StatusCodes.BAD_REQUEST, { emailForm });
    }
    // const error = {};
    // // const { error } = await locals.api.iam.login.request.$post({ json: emailRegisterForm.data }).then(locals.parseApiResponse);
    // if (error) {
    // 	return setError(emailForm, 'email', error);
    // }
    return { emailForm };
  },
  verifyToken: async (event) => {
    const { request, locals } = event;

    const authedUser = await locals.getAuthedUser();
    if (!authedUser) {
      throw redirect(302, '/login', notSignedInMessage, event);
    }

    const tokenForm = await superValidate(request, zod(resetPasswordTokenDto));
    if (!tokenForm.valid) {
      return fail(StatusCodes.BAD_REQUEST, { tokenForm });
    }
    const error = {};
    // const { error } = await locals.api.iam.login.verify.$post({ json: emailSignInForm.data }).then(locals.parseApiResponse)
    if (error) {
      return setError(tokenForm, 'token', error);
    }
    redirect(301, '/');
  },
};
