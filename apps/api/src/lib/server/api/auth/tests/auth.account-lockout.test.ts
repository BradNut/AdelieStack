import {
  AUTH_ACCOUNT_SIGN_IN_FAILURES_IDLE_EXPIRY,
  AUTH_ACCOUNT_SIGN_IN_LOCKOUT,
  AuthErrorCode,
  RETRY_AFTER_HEADER,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
  TWO_FACTOR_ACCOUNT_LOCKOUT,
} from '@adelie/shared';
import { totpCode } from '@adelie/test-utils/totp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockDurationAfter } from '#lib/server/api/auth/auth.lockout-policy';
import { AUTH_RATE_LIMIT_VALKEY_PREFIX, AuthRateLimitRepository, accountLockoutKeys } from '#lib/server/api/auth/auth.rate-limit.repository';
import type { ValkeyService } from '#lib/server/api/databases/valkey/valkey.service';
import { type AuthRequest, signUpWithEmail, signUpWithTotp, startTwoFactorSignIn, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';
import { createValkeyServiceMock } from '../../../../../test/mocks/valkey.mock';

const { maxFailedAttempts: MAX_FAILURES, lockDurationsSeconds: LOCKS } = AUTH_ACCOUNT_SIGN_IN_LOCKOUT;
const [FIRST_LOCK_SECONDS] = LOCKS;
const LONGEST_LOCK_SECONDS = Math.max(...LOCKS);
const WRONG_PASSWORD = 'Wrong-password-1';
const UNKNOWN_EMAIL = 'nobody@example.com';
const MS_PER_SECOND = 1000;

/** A different client address for every call, so nothing here is held back by a per-IP count. */
let lastOctet = 0;
const nextIp = () => `203.0.113.${(lastOctet++ % 250) + 1}`;

/** Freezes the clock (Date only) so a test can move it; the Valkey mock's expiries follow it. */
function freezeClock() {
  vi.useFakeTimers({ toFake: ['Date'] });
  return (seconds: number) => vi.setSystemTime(Date.now() + seconds * MS_PER_SECOND);
}

function build({ withLockout = true } = {}) {
  const valkey = createValkeyServiceMock();
  const repository = new AuthRateLimitRepository(valkey as unknown as ValkeyService);
  const { request: send } = createTestAuth({
    // Client addresses are read, as behind a trusted proxy, but only the account count is under test here.
    clientIp: { trustProxy: true, trustedProxies: [] },
    ...(withLockout ? { accountLockoutStorage: repository } : {}),
  });
  /** Every request from a new client address. */
  const request: AuthRequest = (path, options = {}) => send(path, { ...options, headers: { 'x-forwarded-for': nextIp(), ...options.headers } });
  /** The failures counted for the address since its last success. */
  const failures = async (email: string) =>
    Number((await valkey.get({ prefix: AUTH_RATE_LIMIT_VALKEY_PREFIX, key: accountLockoutKeys(email).failures })) ?? 0);
  /** Stands in for `count` failures already made, from anywhere. */
  const seedFailures = async (email: string, count: number) => {
    for (let i = 0; i < count; i++) await repository.recordFailure(email, AUTH_ACCOUNT_SIGN_IN_LOCKOUT);
  };
  return { request, valkey, failures, seedFailures };
}

const signIn = (request: AuthRequest, email: string, password: string) => request('/sign-in/email', { body: { email, password } });

const setsSession = (res: Response) =>
  res.headers.getSetCookie().some((cookie) => cookie.includes('session_token=') && !cookie.includes('Max-Age=0'));

afterEach(() => {
  vi.useRealTimers();
});

describe('account lockout for password sign-in', () => {
  it('locks after 30 failures for 15 minutes, then 1 hour, then 4 hours', () => {
    expect(MAX_FAILURES).toBe(30);
    expect(LOCKS).toEqual([15 * SECONDS_PER_MINUTE, SECONDS_PER_HOUR, 4 * SECONDS_PER_HOUR]);
  });

  it('stays within NIST SP 800-63B and OWASP ASVS: at most 100 consecutive failures, and 100 an hour, for a limited time', () => {
    expect(MAX_FAILURES).toBeGreaterThan(0);
    expect(MAX_FAILURES).toBeLessThanOrEqual(100);
    for (const [i, seconds] of LOCKS.entries()) {
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeGreaterThanOrEqual(LOCKS[i - 1] ?? 0);
    }
    expect(AUTH_ACCOUNT_SIGN_IN_FAILURES_IDLE_EXPIRY).toBeGreaterThan(LONGEST_LOCK_SECONDS);

    // The fastest attacker: every allowed guess at once, the moment each lock ends. A burst more than the lock list
    // shows the longest one repeating.
    const burstStarts = [0];
    for (let i = 0; i < LOCKS.length + 1; i++) burstStarts.push((burstStarts.at(-1) ?? 0) + (LOCKS[i] ?? LONGEST_LOCK_SECONDS));
    const mostInAnHour = Math.max(...burstStarts.map((start) => burstStarts.filter((t) => t >= start && t < start + SECONDS_PER_HOUR).length));
    expect(mostInAnHour * MAX_FAILURES).toBeLessThanOrEqual(100);
  });

  it('counts failures for one account from many client addresses, then refuses even the right password', async () => {
    const { request, seedFailures } = build();
    await signUpWithEmail(request, TEST_USER);
    const fromManyClients = 3;
    await seedFailures(TEST_USER.email, MAX_FAILURES - fromManyClients);

    for (let i = 0; i < fromManyClients; i++) expect((await signIn(request, TEST_USER.email, WRONG_PASSWORD)).status).toBe(401);

    const res = await signIn(request, TEST_USER.email, TEST_USER.password);

    expect(res.status).toBe(429);
    expect(Number(res.headers.get(RETRY_AFTER_HEADER))).toBe(FIRST_LOCK_SECONDS);
    expect(await res.json()).toMatchObject({ code: AuthErrorCode.SIGN_IN_LOCKED });
    expect(setsSession(res)).toBe(false);
  });

  it('keeps counting without a success, however long the failures take', async () => {
    const advance = freezeClock();
    const { request, seedFailures } = build();
    await signUpWithEmail(request, TEST_USER);
    await seedFailures(TEST_USER.email, MAX_FAILURES - 1);

    advance(2 * FIRST_LOCK_SECONDS);
    expect((await signIn(request, TEST_USER.email, WRONG_PASSWORD)).status).toBe(401);

    expect((await signIn(request, TEST_USER.email, TEST_USER.password)).status).toBe(429);
  });

  it('locks for the full duration from the failure that reached the maximum, however late it came', async () => {
    const advance = freezeClock();
    const { request, seedFailures } = build();
    await signUpWithEmail(request, TEST_USER);
    await seedFailures(TEST_USER.email, MAX_FAILURES - 1);
    advance(FIRST_LOCK_SECONDS - 1);
    expect((await signIn(request, TEST_USER.email, WRONG_PASSWORD)).status).toBe(401);

    advance(FIRST_LOCK_SECONDS - 1);
    const stillLocked = await signIn(request, TEST_USER.email, TEST_USER.password);
    expect(stillLocked.status).toBe(429);
    expect(Number(stillLocked.headers.get(RETRY_AFTER_HEADER))).toBe(1);

    advance(1);
    const res = await signIn(request, TEST_USER.email, TEST_USER.password);
    expect(res.status).toBe(200);
    expect(setsSession(res)).toBe(true);
  });

  it('does not count a refused attempt, nor extend the lock with it', async () => {
    const advance = freezeClock();
    const { request, valkey, seedFailures } = build();
    await signUpWithEmail(request, TEST_USER);
    await seedFailures(TEST_USER.email, MAX_FAILURES);
    const countedBefore = valkey.incrementWithIdleExpiry.mock.calls.length;
    const refusedAttempts = 3;

    advance(FIRST_LOCK_SECONDS / 2);
    for (let i = 0; i < refusedAttempts; i++) {
      const res = await signIn(request, TEST_USER.email, WRONG_PASSWORD);
      expect(res.status).toBe(429);
      expect(Number(res.headers.get(RETRY_AFTER_HEADER))).toBe(FIRST_LOCK_SECONDS / 2);
    }
    expect(valkey.incrementWithIdleExpiry).toHaveBeenCalledTimes(countedBefore);

    advance(FIRST_LOCK_SECONDS / 2);
    expect((await signIn(request, TEST_USER.email, TEST_USER.password)).status).toBe(200);
  });

  it('locks each time for longer than the last, and holds at the longest once reached', async () => {
    const advance = freezeClock();
    const { request, seedFailures } = build();
    await signUpWithEmail(request, TEST_USER);

    for (const expected of [...LOCKS, LONGEST_LOCK_SECONDS]) {
      await seedFailures(TEST_USER.email, MAX_FAILURES - 1);
      expect((await signIn(request, TEST_USER.email, WRONG_PASSWORD)).status).toBe(401);
      const locked = await signIn(request, TEST_USER.email, TEST_USER.password);
      expect(locked.status).toBe(429);
      expect(Number(locked.headers.get(RETRY_AFTER_HEADER))).toBe(expected);
      advance(expected);
    }
  });

  it('starts again at the shortest lock after a correct password', async () => {
    const advance = freezeClock();
    const { request, seedFailures } = build();
    await signUpWithEmail(request, TEST_USER);
    await seedFailures(TEST_USER.email, MAX_FAILURES);
    advance(FIRST_LOCK_SECONDS);
    expect((await signIn(request, TEST_USER.email, TEST_USER.password)).status).toBe(200);

    await seedFailures(TEST_USER.email, MAX_FAILURES);

    const res = await signIn(request, TEST_USER.email, TEST_USER.password);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get(RETRY_AFTER_HEADER))).toBe(FIRST_LOCK_SECONDS);
  });

  it('starts again at the shortest lock after the count is left idle for its expiry', async () => {
    const advance = freezeClock();
    const { request, failures, seedFailures } = build();
    await signUpWithEmail(request, TEST_USER);
    await seedFailures(TEST_USER.email, MAX_FAILURES);
    advance(AUTH_ACCOUNT_SIGN_IN_FAILURES_IDLE_EXPIRY);
    expect(await failures(TEST_USER.email)).toBe(0);

    await seedFailures(TEST_USER.email, MAX_FAILURES);

    const res = await signIn(request, TEST_USER.email, TEST_USER.password);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get(RETRY_AFTER_HEADER))).toBe(FIRST_LOCK_SECONDS);
  });

  it('keeps the count through a lock, so failures after it work towards the next, longer lock', async () => {
    const advance = freezeClock();
    const { request, failures, seedFailures } = build();
    await signUpWithEmail(request, TEST_USER);
    await seedFailures(TEST_USER.email, MAX_FAILURES);

    advance(FIRST_LOCK_SECONDS);
    expect((await signIn(request, TEST_USER.email, WRONG_PASSWORD)).status).toBe(401);

    expect(await failures(TEST_USER.email)).toBe(MAX_FAILURES + 1);
    expect((await signIn(request, TEST_USER.email, TEST_USER.password)).status).toBe(200);
  });

  it('drops a count left idle for its expiry', async () => {
    const advance = freezeClock();
    const { request, failures } = build();
    await signIn(request, UNKNOWN_EMAIL, WRONG_PASSWORD);

    advance(AUTH_ACCOUNT_SIGN_IN_FAILURES_IDLE_EXPIRY - 1);
    await signIn(request, UNKNOWN_EMAIL, WRONG_PASSWORD);
    expect(await failures(UNKNOWN_EMAIL)).toBe(2);

    advance(AUTH_ACCOUNT_SIGN_IN_FAILURES_IDLE_EXPIRY);
    expect(await failures(UNKNOWN_EMAIL)).toBe(0);
  });

  it('clears the count after a successful sign-in', async () => {
    const { request, failures } = build();
    await signUpWithEmail(request, TEST_USER);
    await signIn(request, TEST_USER.email, WRONG_PASSWORD);
    await signIn(request, TEST_USER.email, WRONG_PASSWORD);
    expect(await failures(TEST_USER.email)).toBe(2);

    expect((await signIn(request, TEST_USER.email, TEST_USER.password)).status).toBe(200);
    expect(await failures(TEST_USER.email)).toBe(0);

    await signIn(request, TEST_USER.email, WRONG_PASSWORD);
    expect(await failures(TEST_USER.email)).toBe(1);
  });

  it('clears the count when the right password leads to a second-factor challenge', async () => {
    const { request, failures } = build();
    await signUpWithTotp(request, TEST_USER);
    await signIn(request, TEST_USER.email, WRONG_PASSWORD);

    const { twoFactorRedirect } = await startTwoFactorSignIn(request, TEST_USER);

    expect(twoFactorRedirect).toBe(true);
    expect(await failures(TEST_USER.email)).toBe(0);
  });

  it('counts an unknown address the same way, and refuses it with the same answer', async () => {
    const { request, failures, seedFailures } = build();
    await signUpWithEmail(request, TEST_USER);

    await signIn(request, UNKNOWN_EMAIL, WRONG_PASSWORD);
    expect(await failures(UNKNOWN_EMAIL)).toBe(1);

    // Past the first lock into the second, longer one, so the escalation is compared too.
    await seedFailures(TEST_USER.email, 2 * MAX_FAILURES);
    await seedFailures(UNKNOWN_EMAIL, 2 * MAX_FAILURES - 1);
    const [known, unknown] = [await signIn(request, TEST_USER.email, WRONG_PASSWORD), await signIn(request, UNKNOWN_EMAIL, WRONG_PASSWORD)];

    expect(unknown.status).toBe(known.status);
    expect(unknown.headers.get(RETRY_AFTER_HEADER)).toBe(known.headers.get(RETRY_AFTER_HEADER));
    expect(Number(known.headers.get(RETRY_AFTER_HEADER))).toBe(LOCKS[1]);
    expect(await unknown.json()).toEqual(await known.json());
  });

  it('counts the address case-insensitively, as Better Auth looks it up', async () => {
    const { request, failures } = build();
    await signUpWithEmail(request, TEST_USER);

    await signIn(request, TEST_USER.email.toUpperCase(), WRONG_PASSWORD);

    expect(await failures(TEST_USER.email)).toBe(1);
    expect(accountLockoutKeys(TEST_USER.email.toUpperCase())).toEqual(accountLockoutKeys(TEST_USER.email));
  });

  it('counts only a refused credential, not a malformed request', async () => {
    const { request, valkey } = build();

    expect((await signIn(request, 'not-an-email', WRONG_PASSWORD)).status).toBe(400);
    expect((await request('/sign-in/email', { body: { password: WRONG_PASSWORD } })).status).toBe(400);

    expect(valkey.incrementWithIdleExpiry).not.toHaveBeenCalled();
  });

  it('refuses the sign-in, rather than skipping the limit, when the lock cannot be read', async () => {
    const { request, valkey } = build();
    await signUpWithEmail(request, TEST_USER);
    // The helper's own sign-in after verifying cleared the (empty) count; only the refused sign-in below is under test.
    valkey.delete.mockClear();
    valkey.ttl.mockRejectedValueOnce(new Error('Valkey is unreachable'));

    // Better Auth rethrows it, so the app's error handler answers instead of a session being issued.
    await expect(signIn(request, TEST_USER.email, TEST_USER.password)).rejects.toThrow('Valkey is unreachable');
    expect(valkey.incrementWithIdleExpiry).not.toHaveBeenCalled();
    expect(valkey.delete).not.toHaveBeenCalled();
  });

  it('keeps no email address in Valkey', async () => {
    const { valkey, seedFailures } = build();

    await seedFailures(UNKNOWN_EMAIL, MAX_FAILURES);

    expect(valkey.store.size).toBeGreaterThan(0);
    expect([...valkey.store.keys()].join()).not.toContain(UNKNOWN_EMAIL);
  });

  it('counts nothing without a storage', async () => {
    const { request, valkey } = build({ withLockout: false });

    expect((await signIn(request, UNKNOWN_EMAIL, WRONG_PASSWORD)).status).toBe(401);

    expect(valkey.store.size).toBe(0);
  });
});

describe('lockDurationAfter', () => {
  const policy = { maxFailedAttempts: 3, lockDurationsSeconds: [10, 20] } as const;

  it('locks only on each multiple of the threshold', () => {
    expect([0, 1, 2, 4, 5].map((failures) => lockDurationAfter(policy, failures))).toEqual([null, null, null, null, null]);
    expect(lockDurationAfter(policy, 3)).toBe(10);
  });

  it('takes the next duration for each lock and repeats the last past the end of the list', () => {
    expect([6, 9, 300].map((failures) => lockDurationAfter(policy, failures))).toEqual([20, 20, 20]);
  });

  it('never locks on a count below one', () => {
    expect(lockDurationAfter(policy, -3)).toBeNull();
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
