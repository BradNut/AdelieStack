import { requireUser } from '$lib/server/guards';
import type { LayoutServerLoad } from './$types';

/** Everything under (protected) needs a signed-in user. */
export const load: LayoutServerLoad = async (event) => {
  requireUser(event);
};
