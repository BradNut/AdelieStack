import { StatusCodes } from '@adelie/shared';
import { type Actions, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {};

export const actions: Actions = {
  logout: async ({ locals }) => {
    await locals.api.iam.logout.$post();
    redirect(StatusCodes.SEE_OTHER, '/');
  },
};
