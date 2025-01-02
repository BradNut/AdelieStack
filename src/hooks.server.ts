import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { startServer } from '$lib/server/api';
import { honoClient, parseApiResponse } from '$lib/utils/api';
import { StatusCodes } from '$lib/constants/status-codes';
import { i18n } from './lib/i18n';

const handleParaglide: Handle = i18n.handle();

export const app = await startServer();

const apiClient: Handle = async ({ event, resolve }) => {
	/* ------------------------------ Register api ------------------------------ */
	const { api } = honoClient({
		fetch: event.fetch,
		headers: {
      'x-forwarded-for': event.url.host.includes('sveltekit-prerender') ? '127.0.0.1' : event.getClientAddress(),
      host: event.request.headers.get('host') || '',
    },
	});

	/* ----------------------------- Auth functions ----------------------------- */
	async function getAuthedUser() {
    const { data } = await api.users.me.$get().then(parseApiResponse);
    return data?.user;
  }

  async function getAuthedUserOrThrow() {
    const { data } = await api.users.me.$get().then(parseApiResponse);
    if (!data || !data.user) {
      throw redirect(StatusCodes.TEMPORARY_REDIRECT, '/');
    }
    return data?.user;
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

export const handle: Handle = sequence(apiClient, handleParaglide);
