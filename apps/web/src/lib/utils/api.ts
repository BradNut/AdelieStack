import { hc, type ClientRequestOptions, type ClientResponse } from "hono/client";
import { PUBLIC_API_BASE_URL } from '$env/static/public';

const API_BASE_URL = PUBLIC_API_BASE_URL || 'http://localhost:3001';

export const honoClient = (options?: ClientRequestOptions) => hc(API_BASE_URL, options);

export async function parseClientResponse<T>(response: ClientResponse<T>) {
	if (response.ok) {
		return response.json() as T;
	}

	// handle errors
	const error = await response.text();
	try {
		const jsonError = JSON.parse(error); // attempt to parse as JSON
		throw new Error(jsonError);
	} catch {
		throw new Error(error);
	}
}

export async function parseApiResponse<T>(response: ClientResponse<T>) {
	if (response.status === 204 || response.headers.get('Content-Length') === '0') {
		return response.ok
			? { data: null, error: null, response }
			: { data: null, error: 'An unknown error has occured', response };
	}

	if (response.ok) {
		const data = await response.json() as T;

		return { data, error: null, status: response.status };
	}

	// handle errors
	let error = await response.text();
	try {
		error = JSON.parse(error); // attempt to parse as JSON
	} catch {
		// noop
		return { data: null, error, response };
	}
	return { data: null, error, response };
}
