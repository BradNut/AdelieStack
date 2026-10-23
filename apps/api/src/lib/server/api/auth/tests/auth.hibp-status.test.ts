import { PASSWORD_CHECK_UNAVAILABLE } from '@adelie/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHibpHealth, HIBP_CHECK_FAILED_LOG } from '#lib/server/api/auth/auth.hibp-status';
import { ProviderHealthState } from '#lib/server/api/auth/auth.provider-health';
import { createTestAuth } from '../../../../../test/auth-instance';

const PASSWORD = 'correct horse battery';

function mockHibp(status: number) {
  const fetchMock = vi.fn(async () => new Response('0000000000000000000000000000000000A:0', { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function build(enabled: boolean) {
  const log = { error: vi.fn() };
  const hibpStatus = createHibpHealth({ enabled, log });
  const { request } = createTestAuth({ hibpEnabled: enabled, hibpStatus });
  const signUp = (email: string) => request('/sign-up/email', { body: { name: 'Test', email, password: PASSWORD } });
  return { log, hibpStatus, signUp };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HIBP monitoring through Better Auth', () => {
  it('goes unavailable, logs once and answers 503 with the stable code after a failed check', async () => {
    mockHibp(503);
    const { log, hibpStatus, signUp } = build(true);

    const res = await signUp('a@example.com');

    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe(PASSWORD_CHECK_UNAVAILABLE);
    expect(hibpStatus.health).toBe(ProviderHealthState.UNAVAILABLE);
    expect(log.error).toHaveBeenCalledOnce();
    expect(log.error.mock.calls[0]?.[1]).toContain(HIBP_CHECK_FAILED_LOG);
  });

  it('recovers to available after a successful check', async () => {
    mockHibp(503);
    const { hibpStatus, signUp } = build(true);
    await signUp('a@example.com');

    mockHibp(200);
    const res = await signUp('a@example.com');

    expect(res.status).toBe(200);
    expect(hibpStatus.health).toBe(ProviderHealthState.AVAILABLE);
  });

  it('counts a breached-password answer as HIBP being available', async () => {
    mockHibp(503);
    const { hibpStatus, signUp } = build(true);
    await signUp('a@example.com');
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha1').update(PASSWORD).digest('hex').toUpperCase();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(`${hash.slice(5)}:9`, { status: 200 })),
    );

    const res = await signUp('b@example.com');

    expect(res.status).toBe(400);
    expect(hibpStatus.health).toBe(ProviderHealthState.AVAILABLE);
  });

  it('reports disabled, makes no HIBP request and logs nothing when the switch is off', async () => {
    const fetchMock = mockHibp(503);
    const { log, hibpStatus, signUp } = build(false);

    const res = await signUp('a@example.com');

    expect(res.status).toBe(200);
    expect(hibpStatus.health).toBe(ProviderHealthState.DISABLED);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('reading the health status makes no HIBP request', () => {
    const fetchMock = mockHibp(200);
    const { hibpStatus } = build(true);

    expect(hibpStatus.health).toBe(ProviderHealthState.UNKNOWN);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('outage detection', () => {
  it('does not treat a non-HIBP 500 from hashing as an outage', async () => {
    const { APIError } = await import('better-auth/api');
    const { hibpMonitor } = await import('#lib/server/api/auth/auth.hibp-status');
    const status = createHibpHealth({ enabled: true, log: { error: vi.fn() } });
    const failure = new APIError('INTERNAL_SERVER_ERROR', { message: 'disk on fire' });
    const init = hibpMonitor(status).init as (ctx: unknown) => { context: { password: { hash: (p: string) => Promise<string> } } };
    const { context } = init({ password: { hash: async () => Promise.reject(failure) } });

    await expect(context.password.hash('x')).rejects.toBe(failure);
    expect(status.health).toBe(ProviderHealthState.UNKNOWN);
  });
});
