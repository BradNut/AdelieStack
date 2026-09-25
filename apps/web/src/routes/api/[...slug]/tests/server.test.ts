import { StatusCodes } from '@adelie/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { envMock, fetchMock } = vi.hoisted(() => ({
  envMock: { API_PROXY_BASE_URL: '' },
  fetchMock: vi.fn<typeof fetch>(),
}));

vi.mock('$env/dynamic/private', () => ({
  env: envMock,
}));

import { DELETE, fallback, GET, HEAD, OPTIONS, PATCH, POST, PUT } from '../+server';

type ProxyEvent = Parameters<typeof GET>[0];

const CLIENT_ADDRESS = '203.0.113.7';

function createEvent(request: Request, clientAddress: string | Error = CLIENT_ADDRESS): ProxyEvent {
  const event = {
    request,
    getClientAddress: () => {
      if (clientAddress instanceof Error) throw clientAddress;
      return clientAddress;
    },
  };
  return event as unknown as ProxyEvent;
}

function lastUpstreamCall() {
  const [input, init] = fetchMock.mock.calls.at(-1) ?? [];
  return { url: String(input), init: init ?? {}, headers: new Headers(init?.headers) };
}

async function readUpstreamBody(init: RequestInit): Promise<string | undefined> {
  if (init.body === undefined) return undefined;
  return new Response(init.body).text();
}

describe('routes/api/[...slug]/+server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    envMock.API_PROXY_BASE_URL = 'http://127.0.0.1:3001';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('happy path', () => {
    it('forwards GET with path and query to the API and returns the response unchanged', async () => {
      fetchMock.mockResolvedValue(
        new Response('{"ok":true}', { status: StatusCodes.OK, statusText: 'OK', headers: { 'content-type': 'application/json' } }),
      );

      const response = await GET(createEvent(new Request('http://localhost:5173/api/users/me?limit=10')));

      const upstream = lastUpstreamCall();
      expect(upstream.url).toBe('http://127.0.0.1:3001/api/users/me?limit=10');
      expect(upstream.init.method).toBe('GET');
      expect(upstream.init.body).toBeUndefined();
      expect(upstream.init.redirect).toBe('manual');
      expect(response.status).toBe(StatusCodes.OK);
      expect(response.statusText).toBe('OK');
      expect(response.headers.get('content-type')).toBe('application/json');
      expect(await response.text()).toBe('{"ok":true}');
    });

    it.each([
      ['POST', POST, StatusCodes.CREATED],
      ['PUT', PUT, StatusCodes.OK],
      ['PATCH', PATCH, StatusCodes.OK],
      ['DELETE', DELETE, StatusCodes.OK],
    ] as const)('forwards %s with its request body', async (method, handler, status) => {
      fetchMock.mockResolvedValue(new Response(`${method}-ok`, { status }));
      const payload = JSON.stringify({ method });

      const response = await handler(
        createEvent(
          new Request('http://localhost:5173/api/users/1', {
            method,
            body: payload,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      );

      const upstream = lastUpstreamCall();
      expect(upstream.url).toBe('http://127.0.0.1:3001/api/users/1');
      expect(upstream.init.method).toBe(method);
      expect(upstream.headers.get('content-type')).toBe('application/json');
      expect(await readUpstreamBody(upstream.init)).toBe(payload);
      expect(response.status).toBe(status);
      expect(await response.text()).toBe(`${method}-ok`);
    });

    it('forwards a multipart body byte-for-byte', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: StatusCodes.NO_CONTENT }));
      const form = new FormData();
      form.append('avatar', new Blob([new Uint8Array([0, 1, 2, 255])]), 'avatar.png');
      const request = new Request('http://localhost:5173/api/users/me/avatar', { method: 'POST', body: form });
      const contentType = request.headers.get('content-type');

      const response = await POST(createEvent(request));

      const upstream = lastUpstreamCall();
      expect(upstream.headers.get('content-type')).toBe(contentType);
      const forwarded = await new Request('http://x', {
        method: 'POST',
        body: upstream.init.body,
        headers: { 'content-type': contentType ?? '' },
      }).formData();
      const file = forwarded.get('avatar');
      expect(file).toBeInstanceOf(Blob);
      expect(new Uint8Array(await (file as Blob).arrayBuffer())).toEqual(new Uint8Array([0, 1, 2, 255]));
      expect(response.status).toBe(StatusCodes.NO_CONTENT);
    });

    it.each([
      ['HEAD', HEAD],
      ['OPTIONS', OPTIONS],
    ] as const)('forwards %s without a body', async (method, handler) => {
      fetchMock.mockResolvedValue(new Response(null, { status: StatusCodes.NO_CONTENT }));

      const response = await handler(createEvent(new Request('http://localhost:5173/api/users', { method })));

      const upstream = lastUpstreamCall();
      expect(upstream.init.method).toBe(method);
      if (method === 'HEAD') expect(upstream.init.body).toBeUndefined();
      expect(response.status).toBe(StatusCodes.NO_CONTENT);
    });

    it('forwards methods without a dedicated handler through the fallback', async () => {
      fetchMock.mockResolvedValue(new Response('fallback-ok', { status: StatusCodes.OK }));

      const response = await fallback(createEvent(new Request('http://localhost:5173/api/users', { method: 'PROPFIND' })));

      expect(lastUpstreamCall().init.method).toBe('PROPFIND');
      expect(await response.text()).toBe('fallback-ok');
    });
  });

  describe('cookies and credentials', () => {
    it('forwards request cookies and authorization to the API', async () => {
      fetchMock.mockResolvedValue(new Response('ok'));

      await GET(
        createEvent(
          new Request('http://localhost:5173/api/users/me', {
            headers: { cookie: 'session=abc; theme=dark', authorization: 'Bearer token' },
          }),
        ),
      );

      const { headers } = lastUpstreamCall();
      expect(headers.get('cookie')).toBe('session=abc; theme=dark');
      expect(headers.get('authorization')).toBe('Bearer token');
    });

    it('returns every Set-Cookie header from the API to the browser', async () => {
      const upstreamHeaders = new Headers();
      upstreamHeaders.append('set-cookie', 'session=new; Path=/; HttpOnly; SameSite=Lax');
      upstreamHeaders.append('set-cookie', 'csrf=xyz; Path=/');
      fetchMock.mockResolvedValue(new Response('{}', { status: StatusCodes.OK, headers: upstreamHeaders }));

      const response = await POST(createEvent(new Request('http://localhost:5173/api/iam/login', { method: 'POST', body: '{}' })));

      expect(response.headers.getSetCookie()).toEqual(['session=new; Path=/; HttpOnly; SameSite=Lax', 'csrf=xyz; Path=/']);
    });

    it('returns API redirects to the browser instead of following them', async () => {
      fetchMock.mockResolvedValue(
        new Response(null, { status: StatusCodes.MOVED_TEMPORARILY, headers: { location: 'https://accounts.example.com/oauth' } }),
      );

      const response = await GET(createEvent(new Request('http://localhost:5173/api/iam/login/google')));

      expect(lastUpstreamCall().init.redirect).toBe('manual');
      expect(response.status).toBe(StatusCodes.MOVED_TEMPORARILY);
      expect(response.headers.get('location')).toBe('https://accounts.example.com/oauth');
    });
  });

  describe('headers', () => {
    it('overwrites a client-supplied x-forwarded-for with the real client address', async () => {
      fetchMock.mockResolvedValue(new Response('ok'));

      await GET(createEvent(new Request('http://localhost:5173/api/users', { headers: { 'x-forwarded-for': '10.0.0.1' } })));

      expect(lastUpstreamCall().headers.get('x-forwarded-for')).toBe(CLIENT_ADDRESS);
    });

    it('keeps the existing x-forwarded-for when the client address is unavailable', async () => {
      fetchMock.mockResolvedValue(new Response('ok'));

      await GET(
        createEvent(
          new Request('http://localhost:5173/api/users', { headers: { 'x-forwarded-for': '127.0.0.1' } }),
          new Error('Cannot call getClientAddress() during prerendering'),
        ),
      );

      expect(lastUpstreamCall().headers.get('x-forwarded-for')).toBe('127.0.0.1');
    });

    it('strips hop-by-hop request headers', async () => {
      fetchMock.mockResolvedValue(new Response('ok'));

      await GET(
        createEvent(
          new Request('http://localhost:5173/api/users', {
            headers: { connection: 'keep-alive', 'keep-alive': 'timeout=5', upgrade: 'h2c', 'x-custom': 'kept' },
          }),
        ),
      );

      const { headers } = lastUpstreamCall();
      expect(headers.has('connection')).toBe(false);
      expect(headers.has('keep-alive')).toBe(false);
      expect(headers.has('upgrade')).toBe(false);
      expect(headers.get('x-custom')).toBe('kept');
    });

    it('drops content-encoding and content-length after fetch has decoded the body', async () => {
      fetchMock.mockResolvedValue(new Response('decoded', { headers: { 'content-encoding': 'gzip', 'content-length': '99', 'x-request-id': 'r1' } }));

      const response = await GET(createEvent(new Request('http://localhost:5173/api/users')));

      expect(response.headers.has('content-encoding')).toBe(false);
      expect(response.headers.has('content-length')).toBe(false);
      expect(response.headers.get('x-request-id')).toBe('r1');
      expect(await response.text()).toBe('decoded');
    });
  });

  describe('upstream configuration', () => {
    it('uses API_PROXY_BASE_URL when set', async () => {
      envMock.API_PROXY_BASE_URL = 'https://api.internal:4321';
      fetchMock.mockResolvedValue(new Response('ok'));

      await GET(createEvent(new Request('http://localhost:5173/api/users?page=2')));

      expect(lastUpstreamCall().url).toBe('https://api.internal:4321/api/users?page=2');
    });

    it('defaults to http://127.0.0.1:3001 when API_PROXY_BASE_URL is empty', async () => {
      envMock.API_PROXY_BASE_URL = '';
      fetchMock.mockResolvedValue(new Response('ok'));

      await GET(createEvent(new Request('http://localhost:5173/api/ping')));

      expect(lastUpstreamCall().url).toBe('http://127.0.0.1:3001/api/ping');
    });
  });

  describe('failures', () => {
    it('returns 502 when the API is unreachable', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      const response = await GET(createEvent(new Request('http://localhost:5173/api/users/me')));

      expect(response.status).toBe(StatusCodes.BAD_GATEWAY);
      expect(await response.text()).toBe('API unavailable');
    });

    it('rethrows when the browser aborted the request', async () => {
      const controller = new AbortController();
      const abortError = new DOMException('aborted', 'AbortError');
      fetchMock.mockImplementation(async () => {
        controller.abort();
        throw abortError;
      });

      await expect(GET(createEvent(new Request('http://localhost:5173/api/users', { signal: controller.signal })))).rejects.toBe(abortError);
    });

    it.each([
      [StatusCodes.BAD_REQUEST, '{"message":"Invalid email"}'],
      [StatusCodes.UNAUTHORIZED, '{"message":"Unauthorized"}'],
      [StatusCodes.TOO_MANY_REQUESTS, '{"message":"Too many requests"}'],
      [StatusCodes.INTERNAL_SERVER_ERROR, 'Internal Server Error'],
    ])('passes API error status %i and body through unchanged', async (status, body) => {
      fetchMock.mockResolvedValue(new Response(body, { status, headers: { 'retry-after': '30' } }));

      const response = await POST(createEvent(new Request('http://localhost:5173/api/iam/login', { method: 'POST', body: '{}' })));

      expect(response.status).toBe(status);
      expect(response.headers.get('retry-after')).toBe('30');
      expect(await response.text()).toBe(body);
    });

    it('passes the API 404 through for an unknown slug', async () => {
      fetchMock.mockResolvedValue(new Response('404 Not Found', { status: StatusCodes.NOT_FOUND }));

      const response = await GET(createEvent(new Request('http://localhost:5173/api/does/not/exist')));

      expect(lastUpstreamCall().url).toBe('http://127.0.0.1:3001/api/does/not/exist');
      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect(await response.text()).toBe('404 Not Found');
    });

    it('forwards the bare /api path when the slug is empty', async () => {
      fetchMock.mockResolvedValue(new Response('404 Not Found', { status: StatusCodes.NOT_FOUND }));

      const response = await GET(createEvent(new Request('http://localhost:5173/api')));

      expect(lastUpstreamCall().url).toBe('http://127.0.0.1:3001/api');
      expect(response.status).toBe(StatusCodes.NOT_FOUND);
    });
  });
});
