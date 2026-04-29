import { loadFlash } from "sveltekit-flash-message/server";

export const load = loadFlash(async ({ locals }) => {
  const authedUser = await locals.getAuthedUser();

  return {
    authedUser,
  };
});