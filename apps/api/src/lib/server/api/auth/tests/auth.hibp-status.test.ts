import { PASSWORD_CHECK_UNAVAILABLE } from '@adelie/shared';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuth } from '../auth.config';
import { HIBP_CHECK_FAILED_LOG, HibpHealth, HibpStatus } from '../auth.hibp-status';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct horse battery';

function mockHibp(status: number) {
  const fetchMock = vi.fn(async () => new Response('0000000000000000000000000000000000A:0', { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function build(enabled: boolean) {
  const log = { error: vi.fn() };
  const hibpStatus = new HibpStatus({ enabled, log });
  const auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], twoFactor: [] }),
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    twoFactorIssuer: 'AdelieStack',
    passkey: { rpID: 'localhost', rpName: 'AdelieStack', origin: ORIGIN },
    mailer: { send: async () => {} },
    hibpEnabled: enabled,
    hibpStatus,
  });
  const signUp = (email: string) =>
    auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: new Headers({ origin: ORIGIN, 'content-type': 'application/json' }),
        body: JSON.stringify({ name: 'Test', email, password: PASSWORD }),
      }),
    );
  return { log, hibpStatus, signUp };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HibpStatus', () => {
  it('reports disabled when the switch is off, whatever happened since', () => {
    const status = new HibpStatus({ enabled: false });
    status.recordFailure(new Error('x'));

    expect(status.health).toBe(HibpHealth.DISABLED);
  });

  it('is unknown before any check, then follows the most recent check', () => {
    const status = new HibpStatus({ enabled: true, log: { error: vi.fn() } });
    expect(status.health).toBe(HibpHealth.UNKNOWN);

    status.recordFailure(new Error('x'));
    expect(status.health).toBe(HibpHealth.UNAVAILABLE);

    status.recordSuccess();
    expect(status.health).toBe(HibpHealth.AVAILABLE);
  });

  it('logs one stable entry per failed check and none for a success', () => {
    const log = { error: vi.fn() };
    const status = new HibpStatus({ enabled: true, log });

    status.recordSuccess();
    expect(log.error).not.toHaveBeenCalled();

    status.recordFailure(new Error('boom'));
    expect(log.error).toHaveBeenCalledOnce();
    expect(log.error.mock.calls[0]?.[1]).toContain(HIBP_CHECK_FAILED_LOG);
  });
});

describe('HIBP monitoring through Better Auth', () => {
  it('goes unavailable, logs once and answers 503 with the stable code after a failed check', async () => {
    mockHibp(503);
    const { log, hibpStatus, signUp } = build(true);

    const res = await signUp('a@example.com');

    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe(PASSWORD_CHECK_UNAVAILABLE);
    expect(hibpStatus.health).toBe(HibpHealth.UNAVAILABLE);
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
    expect(hibpStatus.health).toBe(HibpHealth.AVAILABLE);
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
    expect(hibpStatus.health).toBe(HibpHealth.AVAILABLE);
  });

  it('reports disabled, makes no HIBP request and logs nothing when the switch is off', async () => {
    const fetchMock = mockHibp(503);
    const { log, hibpStatus, signUp } = build(false);

    const res = await signUp('a@example.com');

    expect(res.status).toBe(200);
    expect(hibpStatus.health).toBe(HibpHealth.DISABLED);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('reading the health status makes no HIBP request', () => {
    const fetchMock = mockHibp(200);
    const { hibpStatus } = build(true);

    expect(hibpStatus.health).toBe(HibpHealth.UNKNOWN);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('outage detection', () => {
  it('does not treat a non-HIBP 500 from hashing as an outage', async () => {
    const { APIError } = await import('better-auth/api');
    const { hibpMonitor } = await import('../auth.hibp-status');
    const status = new HibpStatus({ enabled: true, log: { error: vi.fn() } });
    const failure = new APIError('INTERNAL_SERVER_ERROR', { message: 'disk on fire' });
    const init = hibpMonitor(status).init as (ctx: unknown) => { context: { password: { hash: (p: string) => Promise<string> } } };
    const { context } = init({ password: { hash: async () => Promise.reject(failure) } });

    await expect(context.password.hash('x')).rejects.toBe(failure);
    expect(status.health).toBe(HibpHealth.UNKNOWN);
  });
});
