import { StatusCodes } from '@adelie/shared';
import { type Handle, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { honoClient, parseApiResponse } from '$lib/utils/api';
import type { Api } from '$lib/utils/types';
import { i18n } from './lib/i18n';

const apiClient: Handle = async ({ event, resolve }) => {
  /* ------------------------------ Register api ------------------------------ */
  const api: Api = honoClient({
    fetch: event.fetch,
    headers: {
      'x-forwarded-for': event.url.host.includes('sveltekit-prerender') ? '127.0.0.1' : event.getClientAddress(),
      host: event.request.headers.get('host') || '',
    },
  });

  /* ----------------------------- Auth functions ----------------------------- */
  type MeUser = {
    id: string;
    first_name: string;
    last_name: string;
    username: string;
    email: string;
    avatar: string | null;
  };

  async function getAuthedUser(): Promise<MeUser | null> {
    const { data } = await api.users.me.$get().then(parseApiResponse<MeUser>);
    return data || null;
  }

  async function getAuthedUserOrThrow(): Promise<MeUser> {
    const { data } = await api.users.me.$get().then(parseApiResponse<MeUser>);
    if (!data) {
      throw redirect(StatusCodes.TEMPORARY_REDIRECT, '/');
    }
    return data;
  }

  /* ------------------------------ Set contexts ------------------------------ */
  event.locals.api = api;
  event.locals.parseApiResponse = parseApiResponse;
  event.locals.getAuthedUser = getAuthedUser;
  event.locals.getAuthedUserOrThrow = getAuthedUserOrThrow;

  /* ----------------------------- Return response ---------------------------- */
  const response = await resolve(event);
  return response;
};

export const handle: Handle = sequence(apiClient, i18n);
