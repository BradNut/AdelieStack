import type { ApiClient } from '@adelie/api-contract';
import { StatusCodes } from '@adelie/shared';
import { type ClientRequestOptions, type ClientResponse, hc } from 'hono/client';

export const honoClient = (options?: ClientRequestOptions): ApiClient['api'] => {
  const client = hc('/', options) as unknown as ApiClient;
  return client.api;
};

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

interface ApiResponseResult<T> {
  data: T | null;
  error: unknown;
  status: number;
  response: ClientResponse<unknown>;
}

export function parseApiResponse<T>(response: ClientResponse<T>): Promise<ApiResponseResult<T>>;
export function parseApiResponse<T>(response: ClientResponse<unknown>): Promise<ApiResponseResult<T>>;
export async function parseApiResponse<T>(response: ClientResponse<unknown>): Promise<ApiResponseResult<T>> {
  if (response.status === StatusCodes.NO_CONTENT || response.headers.get('Content-Length') === '0') {
    return response.ok
      ? { data: null, error: null, status: response.status, response }
      : { data: null, error: 'An unknown error has occured', status: response.status, response };
  }

  if (response.ok) {
    const data = (await response.json()) as T;
    return { data, error: null, status: response.status, response };
  }

  // handle errors
  const rawError = await response.text();
  let error: unknown = rawError;
  try {
    error = JSON.parse(rawError); // attempt to parse as JSON
  } catch {
    // noop
  }

  return { data: null, error, status: response.status, response };
}
