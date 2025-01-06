import { zod } from "sveltekit-superforms/adapters";
import { fail, setError, superValidate } from "sveltekit-superforms";
import { StatusCodes } from "@/constants/status-codes.js";
import { updateEmailDto } from "$lib/dtos/settings/update-email.dto.js";
import { verifyEmailDto } from "$lib/dtos/settings/verify-email.dto.js";
import { redirect } from "sveltekit-flash-message/server";
import { notSignedInMessage } from "$lib/utils/flashMessages.js";

export const load = async (event) => {
	const { parent } = event;
	const { authedUser } = await parent();

  if (!authedUser) {
    throw redirect('/login', notSignedInMessage, event);
  }

	return {
		updateEmailForm: await superValidate(zod(updateEmailDto), {
			defaults: {
				email: authedUser.email
			}
		}),
		verifyEmailForm: await superValidate(zod(verifyEmailDto))
	};
};

export const actions = {
	updateEmail: async ({ request, locals }) => {
		const updateEmailForm = await superValidate(request, zod(updateEmailDto));
		if (!updateEmailForm.valid) return fail(StatusCodes.BAD_REQUEST, { updateEmailForm })
		const { error } = await locals.api.users.me.email.request.$post({ json: updateEmailForm.data }).then(locals.parseApiResponse);
		if (error) return setError(updateEmailForm, 'email', error);
		return { updateEmailForm }
	},
	verifyEmail: async ({ request, locals }) => {
		const verifyEmailForm = await superValidate(request, zod(verifyEmailDto));
		console.log(verifyEmailForm)
		if (!verifyEmailForm.valid) {
			return fail(StatusCodes.BAD_REQUEST, { verifyEmailForm });
		}
		const { error } = await locals.api.users.me.email.verify.$post({ json: verifyEmailForm.data }).then(locals.parseApiResponse);
		if (error) {
			return setError(verifyEmailForm, 'code', error);
		}
		return { verifyEmailForm }
	}
};
