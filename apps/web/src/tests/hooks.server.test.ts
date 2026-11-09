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

    const response = await send(FORWARDED);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect([...response.headers.keys()].filter((name) => name !== 'content-type')).toEqual([]);
  });
});
