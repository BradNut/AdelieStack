import { AUTH_RATE_LIMIT_DEFAULT, AUTH_RATE_LIMIT_RULES, AUTH_RATE_LIMIT_STRICT } from '@adelie/shared';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '#lib/server/api/auth/auth.config';
import type { AuthRateLimitStorage } from '#lib/server/api/auth/auth.rate-limit';
import { AUTH_RATE_LIMIT_REDIS_PREFIX, AuthRateLimitRepository } from '#lib/server/api/auth/auth.rate-limit.repository';
import type { RedisService } from '#lib/server/api/databases/redis/redis.service';
import { createRedisServiceMock } from '../../../../../test/mocks/redis.mock';

const ORIGIN = 'http://localhost:5173';
const SIGN_IN_MAX = AUTH_RATE_LIMIT_STRICT.max;

/** The repository over the shared RedisService mock, so the counters land in its in-memory `store`. */
function createRepository() {
  const redis = createRedisServiceMock();
  return { redis, repository: new AuthRateLimitRepository(redis as unknown as RedisService) };
}

function build({
  withRateLimit = true,
  override,
  trustProxy = true,
}: {
  withRateLimit?: boolean;
  override?: AuthRateLimitStorage;
  trustProxy?: boolean;
} = {}) {
  const { redis, repository } = createRepository();
  const db = { user: [], session: [], account: [], verification: [], twoFactor: [], passkey: [] };
  const auth: Auth = createAuth({
    database: memoryAdapter(db),
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    twoFactorIssuer: 'AdelieStack',
    passkey: { rpID: 'localhost', rpName: 'AdelieStack', origin: ORIGIN },
    mailer: { send: async () => {} },
    signUpEnabled: true,
    hibpEnabled: false,
    trustProxy,
    ...(withRateLimit ? { rateLimitStorage: override ?? repository } : {}),
  });
  return { auth, redis, db };
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
    ['/sign-in/email', '/sign-in/email'],
    ['/two-factor/verify-totp', '/two-factor/verify-totp'],
    ['/two-factor/verify-otp', '/two-factor/verify-otp'],
    ['/two-factor/verify-backup-code', '/two-factor/verify-backup-code'],
    ['/request-password-reset', '/request-password-reset'],
    ['/reset-password', '/reset-password'],
    ['/passkey/generate-authenticate-options', '/passkey/*'],
  ] as const)('applies the stricter rule to %s', async (path, rule) => {
    const { auth } = build();
    const { max } = AUTH_RATE_LIMIT_RULES[rule];
    for (let i = 0; i < max; i++) expect((await post(auth, path, { email: 'a@example.com', code: '000000' })).status).not.toBe(429);

    expect((await post(auth, path, { email: 'a@example.com', code: '000000' })).status).toBe(429);
  });

  it.each(['/sign-in/social', '/two-factor/enable', '/two-factor/send-otp'])('does not apply the strict limit to %s', async (path) => {
    const { auth } = build();
    for (let i = 0; i <= SIGN_IN_MAX * 2; i++) {
      expect((await post(auth, path, { provider: 'github', callbackURL: '/', password: 'Wrong-password-1' })).status).not.toBe(429);
    }
  });

  it('keeps the strict limit below the default', () => {
    expect(AUTH_RATE_LIMIT_STRICT.max).toBeLessThan(AUTH_RATE_LIMIT_DEFAULT.max);
  });

  it('keeps its counters in the injected storage, not in process memory', async () => {
    const { auth, redis } = build();

    await signIn(auth);

    expect(redis.incrementWithExpiry).toHaveBeenCalled();
  });

  it('keeps sessions in the database and only counters in the rate-limit storage', async () => {
    const { auth, redis, db } = build();
    await auth.api.createUser({ body: { name: 'Member', email: 'member@example.com', password: 'Correct-horse-9' } });

    const res = await post(auth, '/sign-in/email', { email: 'member@example.com', password: 'Correct-horse-9' });

    expect(res.status).toBe(200);
    expect(db.session).toHaveLength(1);
    expect([...redis.store.keys()].every((key) => key.startsWith(`${AUTH_RATE_LIMIT_REDIS_PREFIX}:`))).toBe(true);
  });

  it('fails the request rather than skipping the limit when the storage is unreachable', async () => {
    const { auth } = build({ override: { consume: async () => Promise.reject(new Error('redis down')) } });

    await expect(signIn(auth)).rejects.toThrow('redis down');
  });

  it('does not throttle when no rate limit is configured, whatever the environment', async () => {
    const { auth } = build({ withRateLimit: false });
    for (let i = 0; i < SIGN_IN_MAX * 3; i++) expect((await signIn(auth)).status).not.toBe(429);
  });
});

describe('auth rate limiting without a trusted proxy', () => {
  it('ignores x-forwarded-for, so every client lands in one shared bucket per path', async () => {
    const { auth } = build({ trustProxy: false });
    for (let i = 0; i < SIGN_IN_MAX; i++) await signIn(auth, `203.0.113.${i + 1}`);

    // A different client is throttled by the others' attempts: why production refuses this setup.
    expect((await signIn(auth, '198.51.100.1')).status).toBe(429);
  });

  it('keeps clients apart when the proxy is trusted', async () => {
    const { auth } = build({ trustProxy: true });
    for (let i = 0; i < SIGN_IN_MAX; i++) await signIn(auth, `203.0.113.${i + 1}`);

    expect((await signIn(auth, '198.51.100.1')).status).not.toBe(429);
  });
});

describe('AuthRateLimitRepository', () => {
  const rule = { window: 60, max: 2 };

  it('allows requests up to the maximum and refuses the next, with the seconds to wait', async () => {
    const { repository } = createRepository();

    expect(await repository.consume('k', rule)).toEqual({ allowed: true, retryAfter: null });
    expect(await repository.consume('k', rule)).toEqual({ allowed: true, retryAfter: null });
    expect(await repository.consume('k', rule)).toEqual({ allowed: false, retryAfter: 60 });
  });

  it('counts each key separately', async () => {
    const { repository } = createRepository();
    await repository.consume('a', rule);
    await repository.consume('a', rule);
    await repository.consume('a', rule);

    expect(await repository.consume('b', rule)).toEqual({ allowed: true, retryAfter: null });
  });

  it('falls back to the whole window when Redis reports no time left', async () => {
    const { redis, repository } = createRepository();
    redis.incrementWithExpiry.mockResolvedValue({ count: 3, ttl: -1 });

    expect(await repository.consume('k', rule)).toEqual({ allowed: false, retryAfter: rule.window });
  });

  it('counts under its own prefix with the rule window as expiry', async () => {
    const { redis, repository } = createRepository();

    await repository.consume('1.2.3.4|/sign-in/email', rule);

    expect(redis.incrementWithExpiry).toHaveBeenCalledWith({
      prefix: AUTH_RATE_LIMIT_REDIS_PREFIX,
      key: '1.2.3.4|/sign-in/email',
      expiry: rule.window,
    });
  });
});
