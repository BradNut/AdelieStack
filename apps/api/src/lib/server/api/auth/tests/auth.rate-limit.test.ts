import { AUTH_RATE_LIMIT_RULES } from '@adelie/shared';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it, vi } from 'vitest';
import { type Auth, createAuth } from '#lib/server/api/auth/auth.config';
import { AUTH_RATE_LIMIT_REDIS_PREFIX, type AuthRateLimitStorage, createRedisRateLimitStorage } from '#lib/server/api/auth/auth.rate-limit';

const ORIGIN = 'http://localhost:5173';
const SIGN_IN_MAX = AUTH_RATE_LIMIT_RULES['/sign-in/*'].max;

/** Fixed-window counters in a Map, standing in for Redis. `size` shows that counting went through it. */
function createMemoryRateLimitStorage(): AuthRateLimitStorage & { size: number } {
  const counters = new Map<string, number>();
  return {
    get size() {
      return counters.size;
    },
    async consume(key, rule) {
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return count <= rule.max ? { allowed: true, retryAfter: null } : { allowed: false, retryAfter: rule.window };
    },
  };
}

function build({ withRateLimit = true, storage = createMemoryRateLimitStorage() }: { withRateLimit?: boolean; storage?: AuthRateLimitStorage } = {}) {
  const auth: Auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], twoFactor: [], passkey: [] }),
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    twoFactorIssuer: 'AdelieStack',
    passkey: { rpID: 'localhost', rpName: 'AdelieStack', origin: ORIGIN },
    mailer: { send: async () => {} },
    signUpEnabled: true,
    hibpEnabled: false,
    ...(withRateLimit ? { rateLimit: { storage } } : {}),
  });
  return { auth, storage };
}

const post = (auth: Auth, path: string, body: unknown, ip = '203.0.113.7') =>
  auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: 'POST',
      headers: new Headers({ origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': ip }),
      body: JSON.stringify(body),
    }),
  );

const signIn = (auth: Auth, ip?: string) => post(auth, '/sign-in/email', { email: 'nobody@example.com', password: 'Wrong-password-1' }, ip);

describe('auth rate limiting', () => {
  it('throttles sign-in after the configured number of attempts, with a retry time', async () => {
    const { auth } = build();
    for (let i = 0; i < SIGN_IN_MAX; i++) expect((await signIn(auth)).status).not.toBe(429);

    const res = await signIn(auth);

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('x-retry-after'))).toBeGreaterThan(0);
  });

  it('counts each client separately', async () => {
    const { auth } = build();
    for (let i = 0; i <= SIGN_IN_MAX; i++) await signIn(auth, '203.0.113.7');

    expect((await signIn(auth, '203.0.113.8')).status).not.toBe(429);
  });

  it.each([
    ['/two-factor/verify-totp', '/two-factor/*'],
    ['/request-password-reset', '/request-password-reset'],
    ['/passkey/generate-authenticate-options', '/passkey/*'],
  ] as const)('applies the stricter rule to %s', async (path, rule) => {
    const { auth } = build();
    const { max } = AUTH_RATE_LIMIT_RULES[rule];
    for (let i = 0; i < max; i++) expect((await post(auth, path, { email: 'a@example.com', code: '000000' })).status).not.toBe(429);

    expect((await post(auth, path, { email: 'a@example.com', code: '000000' })).status).toBe(429);
  });

  it('keeps its counters in the injected storage, not in process memory', async () => {
    const { auth, storage } = build();

    await signIn(auth);

    expect(storage.size).toBeGreaterThan(0);
  });

  it('fails the request rather than skipping the limit when the storage is unreachable', async () => {
    const { auth } = build({ storage: { consume: async () => Promise.reject(new Error('redis down')) } });

    await expect(signIn(auth)).rejects.toThrow('redis down');
  });

  it('does not throttle when no rate limit is configured, whatever the environment', async () => {
    const { auth } = build({ withRateLimit: false });
    for (let i = 0; i < SIGN_IN_MAX * 3; i++) expect((await signIn(auth)).status).not.toBe(429);
  });
});

describe('Redis rate-limit storage', () => {
  const rule = { window: 60, max: 2 };
  const storageWith = (reply: [number, number]) => {
    const evalMock = vi.fn(async () => reply);
    return { evalMock, storage: createRedisRateLimitStorage(() => ({ eval: evalMock }) as never) };
  };

  it('allows requests up to the maximum', async () => {
    const { storage } = storageWith([2, 40]);

    expect(await storage.consume('k', rule)).toEqual({ allowed: true, retryAfter: null });
  });

  it('refuses past the maximum and reports the seconds left in the window', async () => {
    const { storage } = storageWith([3, 40]);

    expect(await storage.consume('k', rule)).toEqual({ allowed: false, retryAfter: 40 });
  });

  it('falls back to the whole window when Redis reports no expiry', async () => {
    const { storage } = storageWith([3, -1]);

    expect(await storage.consume('k', rule)).toEqual({ allowed: false, retryAfter: rule.window });
  });

  it('counts under a prefixed key with the rule window as expiry', async () => {
    const { storage, evalMock } = storageWith([1, 60]);

    await storage.consume('1.2.3.4|/sign-in/email', rule);

    expect(evalMock).toHaveBeenCalledWith(expect.any(String), 1, `${AUTH_RATE_LIMIT_REDIS_PREFIX}1.2.3.4|/sign-in/email`, rule.window);
  });

  it('opens no connection until the first request', async () => {
    const getRedis = vi.fn(() => ({ eval: vi.fn(async () => [1, 60]) }) as never);
    const storage = createRedisRateLimitStorage(getRedis);
    expect(getRedis).not.toHaveBeenCalled();

    await storage.consume('k', rule);

    expect(getRedis).toHaveBeenCalledTimes(1);
  });
});
