import { AUTH_ACCOUNT_SIGN_IN_FAILURES, AuthErrorCode, RETRY_AFTER_HEADER, TWO_FACTOR_ACCOUNT_LOCKOUT } from '@adelie/shared';
import { totpCode } from '@adelie/test-utils/totp';
import { describe, expect, it } from 'vitest';
import { AUTH_RATE_LIMIT_REDIS_PREFIX, AuthRateLimitRepository, accountLockoutKey } from '#lib/server/api/auth/auth.rate-limit.repository';
import type { RedisService } from '#lib/server/api/databases/redis/redis.service';
import { type AuthRequest, signUpWithEmail, signUpWithTotp, startTwoFactorSignIn, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';
import { createRedisServiceMock } from '../../../../../test/mocks/redis.mock';

const { max: MAX_FAILURES, window: WINDOW } = AUTH_ACCOUNT_SIGN_IN_FAILURES;
const WRONG_PASSWORD = 'Wrong-password-1';
const UNKNOWN_EMAIL = 'nobody@example.com';

/** A different client address for every call, so nothing here is held back by a per-IP count. */
let lastOctet = 0;
const nextIp = () => `203.0.113.${(lastOctet++ % 250) + 1}`;

function build({ withLockout = true } = {}) {
  const redis = createRedisServiceMock();
  const repository = new AuthRateLimitRepository(redis as unknown as RedisService);
  const { request: send } = createTestAuth({
    // Client addresses are read, as behind a trusted proxy, but only the account count is under test here.
    clientIp: { trustProxy: true, trustedProxies: [] },
    ...(withLockout ? { accountLockoutStorage: repository } : {}),
  });
  /** Every request from a new client address. */
  const request: AuthRequest = (path, options = {}) => send(path, { ...options, headers: { 'x-forwarded-for': nextIp(), ...options.headers } });
  const storeKey = (email: string) => `${AUTH_RATE_LIMIT_REDIS_PREFIX}:${accountLockoutKey(email)}`;
  const failures = (email: string) => Number(redis.store.get(storeKey(email))?.value ?? 0);
  /** Stands in for `count` failures already made, from anywhere, in the current window. */
  const seedFailures = (email: string, count: number) => redis.store.set(storeKey(email), { value: String(count), expiry: WINDOW });
  /** The window ending: Redis drops the key. */
  const expire = (email: string) => redis.store.delete(storeKey(email));
  return { request, redis, failures, seedFailures, expire };
}

const signIn = (request: AuthRequest, email: string, password: string) => request('/sign-in/email', { body: { email, password } });

const setsSession = (res: Response) =>
  res.headers.getSetCookie().some((cookie) => cookie.includes('session_token=') && !cookie.includes('Max-Age=0'));

describe('account lockout for password sign-in', () => {
  it('stays within NIST SP 800-63B: at most 100 consecutive failures, for a limited time', () => {
    expect(MAX_FAILURES).toBeGreaterThan(0);
    expect(MAX_FAILURES).toBeLessThanOrEqual(100);
    expect(WINDOW).toBeGreaterThan(0);
  });

  it('counts failures for one account from many client addresses, then refuses even the right password', async () => {
    const { request, failures, seedFailures } = build();
    await signUpWithEmail(request, TEST_USER);
    const fromManyClients = 3;
    seedFailures(TEST_USER.email, MAX_FAILURES - fromManyClients);

    for (let i = 0; i < fromManyClients; i++) expect((await signIn(request, TEST_USER.email, WRONG_PASSWORD)).status).toBe(401);
    expect(failures(TEST_USER.email)).toBe(MAX_FAILURES);

    const res = await signIn(request, TEST_USER.email, TEST_USER.password);

    expect(res.status).toBe(429);
    expect(Number(res.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(0);
    expect(await res.json()).toMatchObject({ code: AuthErrorCode.SIGN_IN_LOCKED });
    expect(setsSession(res)).toBe(false);
  });

  it('does not count a refused attempt, so the lock ends with the window', async () => {
    const { request, failures, seedFailures, expire, redis } = build();
    await signUpWithEmail(request, TEST_USER);
    seedFailures(TEST_USER.email, MAX_FAILURES);

    for (let i = 0; i < 3; i++) expect((await signIn(request, TEST_USER.email, WRONG_PASSWORD)).status).toBe(429);
    expect(failures(TEST_USER.email)).toBe(MAX_FAILURES);
    expect(redis.incrementWithExpiry).not.toHaveBeenCalled();

    expire(TEST_USER.email);
    const res = await signIn(request, TEST_USER.email, TEST_USER.password);

    expect(res.status).toBe(200);
    expect(setsSession(res)).toBe(true);
  });

  it('clears the count after a successful sign-in', async () => {
    const { request, failures } = build();
    await signUpWithEmail(request, TEST_USER);
    await signIn(request, TEST_USER.email, WRONG_PASSWORD);
    await signIn(request, TEST_USER.email, WRONG_PASSWORD);
    expect(failures(TEST_USER.email)).toBe(2);

    expect((await signIn(request, TEST_USER.email, TEST_USER.password)).status).toBe(200);
    expect(failures(TEST_USER.email)).toBe(0);

    await signIn(request, TEST_USER.email, WRONG_PASSWORD);
    expect(failures(TEST_USER.email)).toBe(1);
  });

  it('clears the count when the right password leads to a second-factor challenge', async () => {
    const { request, failures } = build();
    await signUpWithTotp(request, TEST_USER);
    await signIn(request, TEST_USER.email, WRONG_PASSWORD);

    const { twoFactorRedirect } = await startTwoFactorSignIn(request, TEST_USER);

    expect(twoFactorRedirect).toBe(true);
    expect(failures(TEST_USER.email)).toBe(0);
  });

  it('counts an unknown address the same way, and refuses it with the same answer', async () => {
    const { request, failures, seedFailures } = build();
    await signUpWithEmail(request, TEST_USER);

    await signIn(request, UNKNOWN_EMAIL, WRONG_PASSWORD);
    expect(failures(UNKNOWN_EMAIL)).toBe(1);

    seedFailures(TEST_USER.email, MAX_FAILURES);
    seedFailures(UNKNOWN_EMAIL, MAX_FAILURES);
    const [known, unknown] = [await signIn(request, TEST_USER.email, WRONG_PASSWORD), await signIn(request, UNKNOWN_EMAIL, WRONG_PASSWORD)];

    expect(unknown.status).toBe(known.status);
    expect(unknown.headers.get(RETRY_AFTER_HEADER)).toBe(known.headers.get(RETRY_AFTER_HEADER));
    expect(await unknown.json()).toEqual(await known.json());
  });

  it('counts the address case-insensitively, as Better Auth looks it up', async () => {
    const { request, failures } = build();
    await signUpWithEmail(request, TEST_USER);

    await signIn(request, TEST_USER.email.toUpperCase(), WRONG_PASSWORD);

    expect(failures(TEST_USER.email)).toBe(1);
  });

  it('counts only a refused credential, not a malformed request', async () => {
    const { request, redis } = build();

    expect((await signIn(request, 'not-an-email', WRONG_PASSWORD)).status).toBe(400);
    expect((await request('/sign-in/email', { body: { password: WRONG_PASSWORD } })).status).toBe(400);

    expect(redis.incrementWithExpiry).not.toHaveBeenCalled();
  });

  it('keeps no email address in Redis', async () => {
    const { request, redis } = build();

    await signIn(request, UNKNOWN_EMAIL, WRONG_PASSWORD);

    expect([...redis.store.keys()]).toHaveLength(1);
    expect([...redis.store.keys()].join()).not.toContain(UNKNOWN_EMAIL);
  });

  it('counts nothing without a storage', async () => {
    const { request, redis } = build({ withLockout: false });

    expect((await signIn(request, UNKNOWN_EMAIL, WRONG_PASSWORD)).status).toBe(401);

    expect(redis.store.size).toBe(0);
  });
});

describe('account lockout for the second factor', () => {
  it('locks verification for the account after the configured wrong codes from many client addresses', async () => {
    const { request } = build();
    const { totpURI } = await signUpWithTotp(request, TEST_USER);
    const wrong = () => (totpCode(totpURI) === '000000' ? '111111' : '000000');

    // A fresh challenge for every guess, so only the account-wide count can stop them.
    for (let i = 0; i < TWO_FACTOR_ACCOUNT_LOCKOUT.maxFailedAttempts; i++) {
      const { challengeCookie } = await startTwoFactorSignIn(request, TEST_USER);
      expect((await request('/two-factor/verify-totp', { cookie: challengeCookie, body: { code: wrong() } })).status).toBe(401);
    }

    const { challengeCookie } = await startTwoFactorSignIn(request, TEST_USER);
    const res = await request('/two-factor/verify-totp', { cookie: challengeCookie, body: { code: totpCode(totpURI) } });

    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: AuthErrorCode.TWO_FACTOR_LOCKED });
  });
});
