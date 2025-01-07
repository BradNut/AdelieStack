import { zod } from 'sveltekit-superforms/adapters';
import { fail, setError, superValidate } from 'sveltekit-superforms';
import { StatusCodes } from '@/constants/status-codes.js';
import { updateEmailDto } from '$lib/dtos/settings/email/update-email.dto.js';
import { verifyEmailDto } from '$lib/dtos/settings/email/verify-email.dto.js';
import { redirect } from 'sveltekit-flash-message/server';
import { notSignedInMessage } from '$lib/utils/flashMessages.js';
import { changePasswordDto } from '$lib/dtos/settings/password/change-password.dto';

export const load = async (event) => {
  const { parent } = event;
  const { authedUser } = await parent();

  if (!authedUser) {
    throw redirect('/login', notSignedInMessage, event);
  }

  return {
    updateEmailForm: await superValidate(zod(updateEmailDto), {
      defaults: {
        email: authedUser.email,
      },
    }),
    verifyEmailForm: await superValidate(zod(verifyEmailDto)),
    changePasswordForm: await superValidate(zod(changePasswordDto)),
  };
};

export const actions = {
  updateEmail: async ({ request, locals }) => {
    const updateEmailForm = await superValidate(request, zod(updateEmailDto));
    if (!updateEmailForm.valid) return fail(StatusCodes.BAD_REQUEST, { updateEmailForm });
    const { error } = await locals.api.users.me.email.request.$post({ json: updateEmailForm.data }).then(locals.parseApiResponse);
    if (error) return setError(updateEmailForm, 'email', error);
    return { updateEmailForm };
  },
  verifyEmail: async ({ request, locals }) => {
    const verifyEmailForm = await superValidate(request, zod(verifyEmailDto));
    console.log(verifyEmailForm);
    if (!verifyEmailForm.valid) {
      return fail(StatusCodes.BAD_REQUEST, { verifyEmailForm });
    }
    const { error } = await locals.api.users.me.email.verify.$post({ json: verifyEmailForm.data }).then(locals.parseApiResponse);
    if (error) {
      return setError(verifyEmailForm, 'code', error);
    }
    return { verifyEmailForm };
  },
	changePassword: async ({ request, locals }) => {
		const changePasswordForm = await superValidate(request, zod(changePasswordDto));
		if (!changePasswordForm.valid) {
			return fail(StatusCodes.BAD_REQUEST, { changePasswordForm });
		}

		const { error } = await locals.api.users.me.password.$put({ json: changePasswordForm.data }).then(locals.parseApiResponse);
		console.log('error', error);
		if (error) {
			if (error.status === StatusCodes.UNPROCESSABLE_ENTITY) {
				return setError(changePasswordForm, 'confirm_password', 'Confirm password does not match');
			} else if (error.status === StatusCodes.BAD_REQUEST) {
				return setError(changePasswordForm, 'password', error.message);
			} else if (error.status === StatusCodes.FORBIDDEN) {
				return setError(changePasswordForm, 'password', error.message);
			} else {
    		console.log('error', error);
    		return setError(changePasswordForm, 'password', error);
  		}
		}
		return { changePasswordForm };
	},
};
