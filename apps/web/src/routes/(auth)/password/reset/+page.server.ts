import { resetPasswordCodeDto, resetPasswordEmailDto } from '$lib/dtos/reset-password';
import { alreadySignedInMessage, notSignedInMessage } from '$lib/utils/flashMessages';
import { StatusCodes } from '$lib/utils/status-codes';
import { fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { zod } from 'sveltekit-superforms/adapters';
import { setError, superValidate } from 'sveltekit-superforms/server';
import type { PageServerLoad } from './$types';
import { resetPasswordNewPasswordDto } from '$lib/dtos/reset-password/reset-password-new-password.dto';

export const load: PageServerLoad = async (event) => {
  const { locals } = event;
  const authedUser = await locals.getAuthedUser();
  if (authedUser) {
    throw redirect(302, '/', alreadySignedInMessage, event);
  }

  return {
    emailForm: await superValidate(zod(resetPasswordEmailDto)),
    tokenForm: await superValidate(zod(resetPasswordCodeDto)),
    newPasswordForm: await superValidate(zod(resetPasswordNewPasswordDto)),
  };
};

export const actions = {
  passwordResetRequest: async (event) => {
    const { request, locals } = event;

    const authedUser = await locals.getAuthedUser();
    if (authedUser) {
      throw redirect(302, '/', alreadySignedInMessage, event);
    }

    const emailForm = await superValidate(request, zod(resetPasswordEmailDto));
    if (!emailForm.valid) {
      return fail(StatusCodes.BAD_REQUEST, { emailForm });
    }

    const { error } = await locals.api.iam.password.reset.request.$post({ json: emailForm.data }).then(locals.parseApiResponse);
    if (error) {
    	return setError(emailForm, 'email', error);
    }
    return { emailForm };
  },
  verifyCode: async (event) => {
    const { request, locals } = event;

    const authedUser = await locals.getAuthedUser();
    if (authedUser) {
      throw redirect(302, '/', alreadySignedInMessage, event);
    }

    const tokenForm = await superValidate(request, zod(resetPasswordCodeDto));
    console.log('tokenForm', tokenForm);
    if (!tokenForm.valid) {
      return fail(StatusCodes.BAD_REQUEST, { tokenForm });
    }

    const { error } = await locals.api.iam.password.reset.verify.$post({ json: tokenForm.data }).then(locals.parseApiResponse)
    console.log('error', error);
    if (error) {
      return setError(tokenForm, 'token', error);
    }
    return { tokenForm };
  },
  resetPassword: async (event) => {
    const { request, locals } = event;

    const authedUser = await locals.getAuthedUser();
    if (authedUser) {
      throw redirect(302, '/', alreadySignedInMessage, event);
    }

    const newPasswordForm = await superValidate(request, zod(resetPasswordNewPasswordDto));
    if (!newPasswordForm.valid) {
      return fail(StatusCodes.BAD_REQUEST, { newPasswordForm });
    }
    const { error } = await locals.api.iam.password.reset.$post({ json: newPasswordForm.data }).then(locals.parseApiResponse);
    if (error) {
    	return setError(newPasswordForm, 'password', error);
    }
    const message = { type: 'success', message: 'Successfully reset password!' } as const;
    redirect(302, '/login', message, event);
  }
};
