import { AUTH_CLIENT_IP_HEADER } from '@adelie/shared/constants';
import type { RequestEvent } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Resolve = Parameters<Handle>[0]['resolve'];

const { passThrough } = vi.hoisted(() => ({
  passThrough: (({ event, resolve }) => resolve(event)) as Handle,
}));

vi.mock('$app/env/private', () => ({ ADDRESS_HEADER: undefined }));
vi.mock('$app/env', () => ({ dev: false }));
vi.mock('$app/env/public', () => ({ PUBLIC_SENTRY_DSN: undefined }));
vi.mock('@sentry/sveltekit', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  sentryHandle: (): Handle => passThrough,
}));
// The real `sequence` needs SvelteKit's request store, which only exists inside the server runtime.
vi.mock('@sveltejs/kit/hooks', () => ({
  sequence:
    (...handlers: Handle[]): Handle =>
    ({ event, resolve }) => {
      const handlerAt =
        (index: number): Resolve =>
        async (current) =>
          index === handlers.length ? resolve(current) : handlers[index]({ event: current, resolve: handlerAt(index + 1) });
      return handlerAt(0)(event);
    },
}));
vi.mock('#lib/i18n.ts', () => ({
  i18n: passThrough,
}));

const FORWARDED = { [AUTH_CLIENT_IP_HEADER]: '203.0.113.7' };

/** Importing afresh gives each test what a new process would start with. */
async function freshRequestSender() {
  vi.resetModules();
  const { handle } = await import('../hooks.server');
  return (headers: Record<string, string>, { isSubRequest = false } = {}) => {
    const request = new Request('http://localhost/', { headers });
    const event = {
      request,
      url: new URL(request.url),
      getClientAddress: () => '10.0.0.2',
      fetch,
      locals: {},
      isSubRequest,
    } as unknown as RequestEvent;
    return handle({ event, resolve: async () => new Response('ok') });
  };
}

describe('hooks.server handle: client address warning', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('warns for a request from outside that carries a forwarding header', async () => {
    const send = await freshRequestSender();

    await send(FORWARDED);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn for the app's own sub-request, which carries the header the app added", async () => {
    const send = await freshRequestSender();

    await send(FORWARDED, { isSubRequest: true });

    expect(warn).not.toHaveBeenCalled();
  });

  it('still warns for a real proxied request after a sub-request', async () => {
    const send = await freshRequestSender();

    await send(FORWARDED, { isSubRequest: true });
    await send(FORWARDED);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('leaves the response unchanged, so the state is only ever in the logs', async () => {
    const send = await freshRequestSender();

    const plain = await send({});
    const response = await send(FORWARDED);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect([...response.headers.entries()]).toEqual([...plain.headers.entries()]);
  });
});

describe('hooks.server handle: security headers', () => {
  // Literal on purpose: a change to the policy should have to change this test too.
  const EXPECTED_BASELINE = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=(), display-capture=(), accelerometer=(), gyroscope=(), magnetometer=()',
  };
  const HSTS = 'max-age=31536000';

  async function sendTo(url: string, response: Response = new Response('ok', { headers: { 'content-type': 'text/html' } })) {
    vi.resetModules();
    const { handle } = await import('../hooks.server');
    const request = new Request(url);
    const event = {
      request,
      url: new URL(request.url),
      getClientAddress: () => '10.0.0.2',
      fetch,
      locals: {},
      isSubRequest: false,
    } as unknown as RequestEvent;
    return handle({ event, resolve: async () => response });
  }

  function expectBaseline(response: Response) {
    for (const [name, value] of Object.entries(EXPECTED_BASELINE)) {
      expect(response.headers.get(name)).toBe(value);
    }
  }

  it.each([
    ['a page', 'https://example.com/', () => new Response('ok', { headers: { 'content-type': 'text/html' } })],
    ['a proxied API response', 'https://example.com/api/users/me', () => Response.json({ ok: true })],
  ])('sets the baseline headers and HSTS on %s', async (_case, url, response) => {
    const sent = await sendTo(url, response());

    expectBaseline(sent);
    expect(sent.headers.get('strict-transport-security')).toBe(HSTS);
  });

  it('sends no HSTS over http', async () => {
    const response = await sendTo('http://localhost/');

    expectBaseline(response);
    expect(response.headers.has('strict-transport-security')).toBe(false);
  });

  it('drops an HSTS header the API sent when the browser came over http', async () => {
    const upstream = Response.json({ ok: true }, { headers: { 'strict-transport-security': HSTS } });

    const response = await sendTo('http://localhost/api/users/me', upstream);

    expect(response.headers.has('strict-transport-security')).toBe(false);
  });

  it('leaves the page CSP as SvelteKit set it', async () => {
    const csp = "default-src 'self'; script-src 'self' 'nonce-abc'";
    const page = new Response('ok', { headers: { 'content-type': 'text/html', 'content-security-policy': csp } });

    const response = await sendTo('https://example.com/', page);

    expect(response.headers.get('content-security-policy')).toBe(csp);
  });

  it('does not restrict passkeys, captcha or federated sign-in features', async () => {
    const policy = (await sendTo('https://example.com/')).headers.get('permissions-policy') ?? '';

    for (const feature of [
      'publickey-credentials-get',
      'publickey-credentials-create',
      'identity-credentials-get',
      'private-state-token-redemption',
      'private-state-token-issuance',
    ]) {
      expect(policy).not.toContain(feature);
    }
  });

  it('still adds the headers when the response headers are immutable', async () => {
    const immutable = await fetch('data:text/plain,ok');

    const response = await sendTo('https://example.com/', immutable);

    expectBaseline(response);
    expect(await response.text()).toBe('ok');
  });
});
