import { StatusCodes } from '@adelie/shared';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const DEFAULT_API_PROXY_BASE_URL = 'http://127.0.0.1:3001';

// Connection-scoped headers must not be forwarded by a proxy (RFC 9110 section 7.6.1).
// `content-length` is recomputed by fetch from the buffered body.
const HOP_BY_HOP_REQUEST_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
] as const;

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD']);

function getUpstreamUrl(requestUrl: URL): URL {
  const upstreamBase = new URL(env.API_PROXY_BASE_URL || DEFAULT_API_PROXY_BASE_URL);
  const upstreamUrl = new URL(requestUrl);

  upstreamUrl.protocol = upstreamBase.protocol;
  upstreamUrl.username = upstreamBase.username;
  upstreamUrl.password = upstreamBase.password;
  upstreamUrl.host = upstreamBase.host;

  return upstreamUrl;
}

function getClientAddress(event: RequestEvent): string | null {
  try {
    return event.getClientAddress();
  } catch {
    // Not available during prerendering.
    return null;
  }
}

function getUpstreamHeaders(event: RequestEvent): Headers {
  const headers = new Headers(event.request.headers);
  for (const header of HOP_BY_HOP_REQUEST_HEADERS) {
    headers.delete(header);
  }

  // Overwrite rather than trust any client-supplied value; the API rate limiter keys on it.
  const clientAddress = getClientAddress(event);
  if (clientAddress) {
    headers.set('x-forwarded-for', clientAddress);
  }

  return headers;
}

function toDownstreamResponse(upstream: Response): Response {
  const headers = new Headers(upstream.headers);

  // fetch transparently decodes compressed bodies, so the original encoding and length no longer apply.
  if (headers.has('content-encoding')) {
    headers.delete('content-encoding');
    headers.delete('content-length');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function proxyApi(event: RequestEvent): Promise<Response> {
  const { request } = event;
  const body = METHODS_WITHOUT_BODY.has(request.method) ? undefined : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(getUpstreamUrl(new URL(request.url)), {
      method: request.method,
      headers: getUpstreamHeaders(event),
      body,
      // Redirects (e.g. OAuth) belong to the browser, not the proxy.
      redirect: 'manual',
      signal: request.signal,
    });
  } catch (error) {
    if (request.signal.aborted) {
      throw error;
    }
    return new Response('API unavailable', { status: StatusCodes.BAD_GATEWAY });
  }

  return toDownstreamResponse(upstream);
}

export const GET: RequestHandler = proxyApi;
export const HEAD: RequestHandler = proxyApi;
export const POST: RequestHandler = proxyApi;
export const PUT: RequestHandler = proxyApi;
export const PATCH: RequestHandler = proxyApi;
export const DELETE: RequestHandler = proxyApi;
export const OPTIONS: RequestHandler = proxyApi;
export const fallback: RequestHandler = proxyApi;
