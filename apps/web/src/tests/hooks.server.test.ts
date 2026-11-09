import type { RequestEvent } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Resolve = Parameters<Handle>[0]['resolve'];

const { envMock, passThrough } = vi.hoisted(() => ({
  envMock: { ADDRESS_HEADER: undefined as string | undefined },
  passThrough: (({ event, resolve }) => resolve(event)) as Handle,
}));

vi.mock('$app/env/private', () => ({
  get ADDRESS_HEADER() {
    return envMock.ADDRESS_HEADER;
  },
}));
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
vi.mock('#lib/server/session-user.ts', () => ({ loadSessionUser: vi.fn(async () => null) }));
vi.mock('../lib/i18n', () => ({
  i18n: passThrough,
}));

/** Importing afresh gives each test what a new process would start with. */
async function freshProcessHandle() {
  vi.resetModules();
  const { handle } = await import('../hooks.server');
  return (headers: Record<string, string>) => {
    const request = new Request('http://localhost/', { headers });
    const event = { request, url: new URL(request.url), getClientAddress: () => '10.0.0.2', fetch, locals: {} } as unknown as RequestEvent;
    return handle({ event, resolve: async () => new Response('ok') });
  };
}

describe('hooks.server handle: client address warning', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    envMock.ADDRESS_HEADER = undefined;
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('warns naming ADDRESS_HEADER when a request carries X-Forwarded-For and it is unset', async () => {
    const send = await freshProcessHandle();

    await send({ 'x-forwarded-for': '203.0.113.7' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('ADDRESS_HEADER');
  });

  it.each([
    ['x-forwarded-for', '203.0.113.7'],
    ['x-real-ip', '203.0.113.7'],
    ['cf-connecting-ip', '203.0.113.7'],
    ['forwarded', 'for=203.0.113.7'],
  ])('warns for %s', async (header, value) => {
    const send = await freshProcessHandle();

    await send({ [header]: value });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(header);
  });

  it('warns at most once per process, however many requests or headers arrive', async () => {
    const send = await freshProcessHandle();

    await send({ 'x-forwarded-for': '203.0.113.7' });
    await send({ 'x-forwarded-for': '203.0.113.8' });
    await send({ 'x-real-ip': '203.0.113.9' });

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('never writes the client-supplied header value to the log', async () => {
    const send = await freshProcessHandle();

    await send({ 'x-forwarded-for': 'attacker-controlled' });

    expect(String(warn.mock.calls[0][0])).not.toContain('attacker-controlled');
  });

  it('does not warn when ADDRESS_HEADER is set', async () => {
    envMock.ADDRESS_HEADER = 'x-forwarded-for';
    const send = await freshProcessHandle();

    await send({ 'x-forwarded-for': '203.0.113.7' });

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when the request has no forwarding headers', async () => {
    const send = await freshProcessHandle();

    await send({ accept: 'text/html', 'user-agent': 'curl/8' });

    expect(warn).not.toHaveBeenCalled();
  });

  it('warns on a later forwarded request after an earlier direct one', async () => {
    const send = await freshProcessHandle();

    await send({});
    await send({ 'x-forwarded-for': '203.0.113.7' });

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('leaves the response unchanged, so the state is only ever in the logs', async () => {
    const send = await freshProcessHandle();

    const response = await send({ 'x-forwarded-for': '203.0.113.7' });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect([...response.headers.keys()].filter((name) => name !== 'content-type')).toEqual([]);
  });
});
