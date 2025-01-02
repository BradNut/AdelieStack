// import { app } from '$lib/server/api';
import type { RequestHandler } from '@sveltejs/kit';
import { app } from '../../../hooks.server';

export const GET: RequestHandler = ({ request }) => app.request(request);
export const PUT: RequestHandler = ({ request }) => app.request(request);
export const DELETE: RequestHandler = ({ request }) => app.fetch(request);
export const POST: RequestHandler = ({ request }) => app.fetch(request);
export const PATCH: RequestHandler = ({ request }) => app.fetch(request);
export const fallback: RequestHandler = ({ request }) => app.fetch(request);

// export const fallback: RequestHandler = ({ request, getClientAddress }) => {
// 	request.headers.set('x-forwarded-for', getClientAddress());
// 	return routes.fetch(request);
// }
