import {
  AUTH_RATE_LIMIT_DEFAULT,
  AUTH_RATE_LIMIT_DEFAULT_PATHS,
  AUTH_RATE_LIMIT_EMAIL,
  AUTH_RATE_LIMIT_RULES,
  AUTH_RATE_LIMIT_SIGN_UP,
  AUTH_RATE_LIMIT_STRICT,
  type AuthRateLimitRule,
  RETRY_AFTER_HEADER,
} from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import type { Auth } from '#lib/server/api/auth/auth.config';
import type { AuthRateLimitStorage } from '#lib/server/api/auth/auth.rate-limit';
import { AUTH_RATE_LIMIT_REDIS_PREFIX, AuthRateLimitRepository } from '#lib/server/api/auth/auth.rate-limit.repository';
import type { RedisService } from '#lib/server/api/databases/redis/redis.service';
import { type AuthRequest, signUpWithTotp, startTwoFactorSignIn } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';
import { createRedisServiceMock } from '../../../../../test/mocks/redis.mock';

const CLIENT_IP = '203.0.113.7';
const STRICT_MAX = AUTH_RATE_LIMIT_STRICT.max;
const WILDCARD = '*';
/** The rules as Better Auth sees them: keys in declaration order, looked up by plain string. */
const RULES: Readonly<Record<string, AuthRateLimitRule>> = AUTH_RATE_LIMIT_RULES;
const RULE_KEYS = Object.keys(RULES);
const isWildcard = (key: string) => key.includes(WILDCARD);
const EXACT_RULE_KEYS = RULE_KEYS.filter((key) => !isWildcard(key));
/** The wildcard rules pinned to the default (`/sign-in/*`, `/two-factor/*`), keyed to the prefix they cover. */
const WILDCARD_PINS = RULE_KEYS.filter((key) => key.endsWith(`/${WILDCARD}`) && RULES[key] === AUTH_RATE_LIMIT_DEFAULT).map((rule) => ({
  rule,
  prefix: rule.slice(0, -WILDCARD.length),
}));
/**
 * Path starts Better Auth's built-in limit (3 per 10 seconds) covers that this suite guards: no trailing slash, so `/sign-in-foo`
 * too. `/change-password` and `/change-email` are also built-in limited but not guarded here.
 */
const BUILT_IN_LIMITED_PREFIXES = ['/sign-in', '/sign-up', '/two-factor'] as const;
const DEFAULT_PATHS: readonly string[] = AUTH_RATE_LIMIT_DEFAULT_PATHS;

/**
 * Exact keys listed after a wildcard that also matches them. Better Auth takes the first matching key,
 * so such a key would never apply.
 */
function shadowedExactKeys(keys: readonly string[]): string[] {
  return keys.flatMap((key, index) =>
    isWildcard(key)
      ? []
      : keys
          .slice(0, index)
          .filter((earlier) => isWildcard(earlier) && key.startsWith(earlier.slice(0, earlier.indexOf(WILDCARD))))
          .map((earlier) => `${key} after ${earlier}`),
  );
}

/** Paths under Better Auth's built-in limit that neither have an exact rule nor are deliberately on the default. */
function unruledBuiltInLimitedPaths(paths: readonly string[]): string[] {
  return paths.filter(
    (path) => BUILT_IN_LIMITED_PREFIXES.some((prefix) => path.startsWith(prefix)) && !EXACT_RULE_KEYS.includes(path) && !DEFAULT_PATHS.includes(path),
  );
}

/**
 * Every endpoint path of the auth instance. Relies on Better Auth exposing `.path` on its endpoints;
 * the tests assert known paths are present, so a change there fails loudly instead of passing empty.
 */
function authApiPaths(auth: Auth): string[] {
  return Object.values(auth.api)
    .map((endpoint) => endpoint.path)
    .filter((path): path is string => typeof path === 'string');
}

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
  const { auth, db, mailer, request } = createTestAuth({ trustProxy, ...(withRateLimit ? { rateLimitStorage: override ?? repository } : {}) });
  /** Every request comes from one client unless the test says otherwise. */
  const fromClient: AuthRequest = (path, options = {}) =>
    request(path, { ...options, headers: { 'x-forwarded-for': CLIENT_IP, ...options.headers } });
  return { auth, redis, db, send: mailer.send, request: fromClient };
}

const post = (request: AuthRequest, path: string, body: unknown, { ip = CLIENT_IP, cookie }: { ip?: string; cookie?: string } = {}) =>
  request(path, { body, cookie, headers: { 'x-forwarded-for': ip } });

const MEMBER = { name: 'Member', email: 'member@example.com', password: 'Correct-horse-9' };

const signUp = (request: AuthRequest, email: string, ip?: string) => post(request, '/sign-up/email', { ...MEMBER, email }, { ip });

const signIn = (request: AuthRequest, ip?: string) =>
  post(request, '/sign-in/email', { email: 'nobody@example.com', password: 'Wrong-password-1' }, { ip });

describe('auth rate limiting', () => {
  it('throttles sign-in after the configured number of attempts, with a retry time', async () => {
    const { request } = build();
    for (let i = 0; i < STRICT_MAX; i++) expect((await signIn(request)).status).not.toBe(429);

    const res = await signIn(request);

    expect(res.status).toBe(429);
    expect(Number(res.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(0);
  });

  it('counts each client separately', async () => {
    const { request } = build();
    for (let i = 0; i <= STRICT_MAX; i++) await signIn(request, CLIENT_IP);

    expect((await signIn(request, '203.0.113.8')).status).not.toBe(429);
  });

  // The two-factor management endpoints and sending a code need a session or a challenge cookie, so they answer 401 until the limiter, which runs first, refuses them.
  // Strict and email rows come from the rule table itself; the explicit rows are the own rules, where the passkey path differs from its key.
  it.each<readonly [path: string, rule: string]>([
    ...EXACT_RULE_KEYS.filter((key) => RULES[key] === AUTH_RATE_LIMIT_STRICT || RULES[key] === AUTH_RATE_LIMIT_EMAIL).map(
      (key) => [key, key] as const,
    ),
    ['/reset-password', '/reset-password'],
    ['/passkey/generate-authenticate-options', '/passkey/*'],
  ])('applies the stricter rule to %s, with a retry time', async (path, rule) => {
    const { request } = build();
    // A union of every endpoint's fields, so one payload serves them all.
    const body = { email: 'a@example.com', code: '000000', password: 'Wrong-password-1' };
    const { max } = RULES[rule];
    for (let i = 0; i < max; i++) expect((await post(request, path, body)).status).not.toBe(429);

    const res = await post(request, path, body);

    expect(res.status).toBe(429);
    expect(Number(res.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(0);
  });

  it('emails a two-factor code only up to the email limit, then refuses with a retry time and sends nothing', async () => {
    const { request, send } = build();
    await signUpWithTotp(request, MEMBER);
    const { challengeCookie: challenge, twoFactorRedirect } = await startTwoFactorSignIn(request, MEMBER);
    expect(twoFactorRedirect).toBe(true);
    send.mockClear(); // drop the sign-up verification email
    const sendOtp = () => post(request, '/two-factor/send-otp', {}, { cookie: challenge });
    for (let i = 1; i <= AUTH_RATE_LIMIT_EMAIL.max; i++) {
      expect((await sendOtp()).status).toBe(200);
      expect(send).toHaveBeenCalledTimes(i);
    }

    const res = await sendOtp();

    expect(res.status).toBe(429);
    expect(Number(res.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(0);
    expect(send).toHaveBeenCalledTimes(AUTH_RATE_LIMIT_EMAIL.max);
  });

  it('resends the verification email only up to the email limit, then refuses with a retry time and sends nothing', async () => {
    const { request, send } = build();
    const email = 'unverified@example.com';
    await signUp(request, email);
    send.mockClear(); // drop the sign-up verification email
    const resend = () => post(request, '/send-verification-email', { email });
    for (let i = 1; i <= AUTH_RATE_LIMIT_EMAIL.max; i++) {
      expect((await resend()).status).toBe(200);
      expect(send).toHaveBeenCalledTimes(i);
    }

    const res = await resend();

    expect(res.status).toBe(429);
    // The email window, not Better Auth's built-in one for this path (3 a minute); the Redis mock reports the full window as time left.
    expect(Number(res.headers.get(RETRY_AFTER_HEADER))).toBe(AUTH_RATE_LIMIT_EMAIL.window);
    expect(send).toHaveBeenCalledTimes(AUTH_RATE_LIMIT_EMAIL.max);
  });

  const signUpEmail = (i: number) => `new-${i}@example.com`;

  it('creates the account and sends the verification email for sign-ups up to the sign-up limit, then refuses with a retry time, creating no user and sending nothing', async () => {
    const { request, db, send } = build();
    for (let i = 1; i <= AUTH_RATE_LIMIT_SIGN_UP.max; i++) {
      expect((await signUp(request, signUpEmail(i))).status).toBe(200);
      expect(db.user).toHaveLength(i);
      expect(send).toHaveBeenCalledTimes(i);
    }

    const res = await signUp(request, 'one-too-many@example.com');

    expect(res.status).toBe(429);
    // The sign-up window, not Better Auth's built-in one for `/sign-up*` (3 per 10 seconds); the Redis mock reports the full window as time left.
    expect(Number(res.headers.get(RETRY_AFTER_HEADER))).toBe(AUTH_RATE_LIMIT_SIGN_UP.window);
    expect(db.user).toHaveLength(AUTH_RATE_LIMIT_SIGN_UP.max);
    expect(send).toHaveBeenCalledTimes(AUTH_RATE_LIMIT_SIGN_UP.max);
  });

  it('refuses a sign-up with an existing address without sending an email, and counts it toward the sign-up limit', async () => {
    const { request, db, send } = build();
    const email = 'taken@example.com';
    expect((await signUp(request, email)).status).toBe(200);
    send.mockClear(); // drop the first sign-up's verification email
    for (let i = 1; i < AUTH_RATE_LIMIT_SIGN_UP.max; i++) expect((await signUp(request, email)).status).toBe(422);
    expect(send).not.toHaveBeenCalled();

    const res = await signUp(request, 'fresh@example.com');

    expect(res.status).toBe(429);
    expect(db.user).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('counts each client separately for the sign-up limit', async () => {
    const { request } = build();
    for (let i = 1; i <= AUTH_RATE_LIMIT_SIGN_UP.max; i++) await signUp(request, signUpEmail(i), CLIENT_IP);
    expect((await signUp(request, 'late@example.com', CLIENT_IP)).status).toBe(429);

    expect((await signUp(request, 'other@example.com', '203.0.113.8')).status).toBe(200);
  });

  // Without a challenge cookie the endpoint answers 401, but the limiter runs first and counts it all the same.
  it('counts each client separately for the email limit', async () => {
    const { request } = build();
    const sendOtp = (ip: string) => post(request, '/two-factor/send-otp', {}, { ip });
    for (let i = 0; i < AUTH_RATE_LIMIT_EMAIL.max; i++) await sendOtp(CLIENT_IP);
    expect((await sendOtp(CLIENT_IP)).status).toBe(429);

    expect((await sendOtp('203.0.113.8')).status).not.toBe(429);
  });

  // A union of every endpoint's fields, so one payload serves them all.
  const defaultPathBody = { provider: 'github', callbackURL: '/', password: 'Wrong-password-1' };

  it.each(AUTH_RATE_LIMIT_DEFAULT_PATHS)('does not apply the strict limit to %s', async (path) => {
    const { request } = build();
    for (let i = 0; i <= STRICT_MAX * 2; i++) {
      expect((await post(request, path, defaultPathBody)).status).not.toBe(429);
    }
  });

  // The two-factor path needs a session, so it answers 401 until the limiter refuses it.
  it.each(WILDCARD_PINS.map(({ rule, prefix }) => [rule, DEFAULT_PATHS.find((path) => path.startsWith(prefix))] as const))(
    "applies the default limit, not Better Auth's built-in one, to %s (via %s)",
    async (_rule, path) => {
      // Each pin needs a deliberately-default path below it to probe.
      expect(path).toBeDefined();
      if (path === undefined) return;
      const { request } = build();
      const callPath = () => post(request, path, defaultPathBody);
      for (let i = 0; i < AUTH_RATE_LIMIT_DEFAULT.max; i++) expect((await callPath()).status).not.toBe(429);

      expect((await callPath()).status).toBe(429);
    },
  );

  it('pins exactly the sign-in and two-factor wildcards to the default', () => {
    expect(WILDCARD_PINS.map(({ rule }) => rule)).toEqual(['/sign-in/*', '/two-factor/*']);
  });

  it('gives every sign-in, sign-up and two-factor endpoint an exact rule unless it is deliberately on the default', () => {
    const paths = authApiPaths(build().auth);

    expect(paths).toEqual(expect.arrayContaining(['/sign-in/email', '/sign-up/email', '/two-factor/verify-totp']));
    expect(unruledBuiltInLimitedPaths(paths)).toEqual([]);
  });

  it('flags an endpoint under the built-in limit without a slash after the prefix', () => {
    expect(
      unruledBuiltInLimitedPaths(['/sign-in-magic', '/sign-up-magic', '/two-factorish', '/sign-in/email', '/sign-up/email', '/sign-out']),
    ).toEqual(['/sign-in-magic', '/sign-up-magic', '/two-factorish']);
  });

  it('lists only real endpoints without an exact rule as deliberately on the default', () => {
    const paths = authApiPaths(build().auth);

    expect(paths).toEqual(expect.arrayContaining(['/sign-in/email']));
    expect(DEFAULT_PATHS.filter((path) => !paths.includes(path) || EXACT_RULE_KEYS.includes(path))).toEqual([]);
  });

  it('lists every exact rule before a wildcard that also matches it, since the first matching key wins', () => {
    expect(shadowedExactKeys(RULE_KEYS)).toEqual([]);
  });

  it('flags an exact rule listed after a wildcard that matches it', () => {
    const reordered = ['/sign-in/*', '/sign-in/email', '/two-factor/*', '/passkey/*', '/two-factor/verify-totp', '/reset-password'];

    expect(shadowedExactKeys(reordered)).toEqual(['/sign-in/email after /sign-in/*', '/two-factor/verify-totp after /two-factor/*']);
  });

  it.each([
    ['strict', AUTH_RATE_LIMIT_STRICT],
    ['email', AUTH_RATE_LIMIT_EMAIL],
    ['sign-up', AUTH_RATE_LIMIT_SIGN_UP],
  ] as const)('keeps the %s limit below the default', (_name, rule) => {
    // Fewer requests per second than the default: max / window, compared without division.
    expect(rule.max * AUTH_RATE_LIMIT_DEFAULT.window).toBeLessThan(AUTH_RATE_LIMIT_DEFAULT.max * rule.window);
  });

  it('keeps its counters in the injected storage, not in process memory', async () => {
    const { request, redis } = build();

    await signIn(request);

    expect(redis.incrementWithExpiry).toHaveBeenCalled();
  });

  it('keeps sessions in the database and only counters in the rate-limit storage', async () => {
    const { auth, request, redis, db } = build();
    await auth.api.createUser({ body: { name: 'Member', email: 'member@example.com', password: 'Correct-horse-9' } });

    const res = await post(request, '/sign-in/email', { email: 'member@example.com', password: 'Correct-horse-9' });

    expect(res.status).toBe(200);
    expect(db.session).toHaveLength(1);
    expect([...redis.store.keys()].every((key) => key.startsWith(`${AUTH_RATE_LIMIT_REDIS_PREFIX}:`))).toBe(true);
  });

  it('fails the request rather than skipping the limit when the storage is unreachable', async () => {
    const { request } = build({ override: { consume: async () => Promise.reject(new Error('redis down')) } });

    await expect(signIn(request)).rejects.toThrow('redis down');
  });

  it('does not throttle when no rate limit is configured, whatever the environment', async () => {
    const { request } = build({ withRateLimit: false });
    for (let i = 0; i < STRICT_MAX * 3; i++) expect((await signIn(request)).status).not.toBe(429);
  });
});

describe('auth rate limiting without a trusted proxy', () => {
  it('ignores x-forwarded-for, so every client lands in one shared bucket per path', async () => {
    const { request } = build({ trustProxy: false });
    for (let i = 0; i < STRICT_MAX; i++) await signIn(request, `203.0.113.${i + 1}`);

    // A different client is throttled by the others' attempts: why production refuses this setup.
    const res = await signIn(request, '198.51.100.1');

    expect(res.status).toBe(429);
    expect(Number(res.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(0);
  });

  it('keeps clients apart when the proxy is trusted', async () => {
    const { request } = build({ trustProxy: true });
    for (let i = 0; i < STRICT_MAX; i++) await signIn(request, `203.0.113.${i + 1}`);

    expect((await signIn(request, '198.51.100.1')).status).not.toBe(429);
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
