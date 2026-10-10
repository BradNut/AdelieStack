import { RoleName } from '@adelie/shared';
import { requireUser } from '$lib/server/guards';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  requireUser(event, [RoleName.ADMIN]);
};
