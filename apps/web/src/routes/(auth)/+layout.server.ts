import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  const { parent } = event;
  const { authedUser } = await parent();

  return {
    authedUser,
  };
};
