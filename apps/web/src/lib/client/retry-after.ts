import { RETRY_AFTER_HEADER, StatusCodes } from '@adelie/shared';

/**
 * Wraps a fetch so a throttled (429) JSON response carries its `X-Retry-After` header as a `retryAfter` number in
 * the body. Better Auth's client error holds only the body and status, so this is how the wait reaches the forms.
 */
export function withRetryAfter(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await base(input, init);
    if (response.status !== StatusCodes.TOO_MANY_REQUESTS) return response;
    const seconds = Number(response.headers.get(RETRY_AFTER_HEADER));
    if (!Number.isFinite(seconds) || seconds <= 0) return response;

    let body: unknown = null;
    try {
      body = await response.clone().json();
    } catch {
      // Not JSON: the status alone still marks the error as throttled.
    }
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    return new Response(JSON.stringify({ ...(body && typeof body === 'object' ? body : {}), retryAfter: seconds }), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
