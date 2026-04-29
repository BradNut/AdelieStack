import { StatusCodes } from "$lib/constants/status-codes";
import { redirect } from "@sveltejs/kit";

export const load = async ({ locals }) => {
};

export const actions = {
	logout: async ({ locals }) => {
		await locals.api.iam.logout.$post()
		redirect(StatusCodes.SEE_OTHER, '/')
	}
}

