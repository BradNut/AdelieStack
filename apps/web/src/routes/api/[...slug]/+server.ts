import { AUTH_CLIENT_IP_HEADER, FORWARDED_PROTO_HEADER, notFoundMessage, STORAGE_WEBHOOK_PATH, StatusCodes } from '@adelie/shared';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { getPath } from 'hono/utils/url';
import { API_PROXY_BASE_URL } from '$app/env/private';

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

/** Decodes each run of percent-escapes on its own, so one malformed escape cannot shield the rest from decoding. */
function decodePath(path: string): string {
  return path.replace(/(?:%[0-9A-Fa-f]{2})+/g, (escapes) => {
    try {
      return decodeURIComponent(escapes);
    } catch {
      return escapes;
    }
  });
}

/**
 * Reduces a path to the segments a router could match: decoded (encoded slashes included), case-folded, with empty and
 * dot segments resolved. This folds together more spellings than the API router does, so no variant slips past.
 */
function normalizePath(path: string): string {
  const segments: string[] = [];
  for (const segment of decodePath(path).toLowerCase().split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join('/')}`;
}

// Not forwarded; see STORAGE_WEBHOOK_PATH.
const INTERNAL_ONLY_PATHS = [normalizePath(STORAGE_WEBHOOK_PATH)];

function isInternalOnlyPath(requestUrl: URL): boolean {
  const path = normalizePath(requestUrl.pathname);
  return INTERNAL_ONLY_PATHS.some((blocked) => path === blocked || path.startsWith(`${blocked}/`));
}

function getUpstreamUrl(requestUrl: URL): URL {
  const upstreamBase = new URL(API_PROXY_BASE_URL || DEFAULT_API_PROXY_BASE_URL);
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
    headers.set(AUTH_CLIENT_IP_HEADER, clientAddress);
  }
  // The scheme adapter-node resolved for the browser's request, not a client's claim; the API sends HSTS by it.
  headers.set(FORWARDED_PROTO_HEADER, new URL(event.request.url).protocol.replace(/:$/, ''));

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
  const requestUrl = new URL(request.url);
  // Answered as the API answers an unknown route (path as its router sees it), so the block is indistinguishable.
  if (isInternalOnlyPath(requestUrl)) {
    return Response.json({ message: notFoundMessage(getPath(request)) }, { status: StatusCodes.NOT_FOUND });
  }

  const body = METHODS_WITHOUT_BODY.has(request.method) ? undefined : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(getUpstreamUrl(requestUrl), {
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
