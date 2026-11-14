import { hashPassword as betterAuthDefaultHash } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';
import { createPasswordHasher } from '#lib/server/api/auth/auth.password-hash';
import { hasSessionCookie, signUpWithEmail, signUpWithTotp, startTwoFactorSignIn, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const CURRENT_HASH = /^\$scrypt\$n=65536,r=8,p=2\$/;
/** Every hash here is at the production cost, which is slow on purpose. */
const SLOW = { timeout: 30_000 };
const hasher = createPasswordHasher();

/** An instance at the production cost, unlike the cheap test default. */
const productionCostAuth = () => createTestAuth({ passwordHasher: hasher });

/** A signed-up user whose stored hash is put back to one Better Auth wrote at its default cost, before this change. */
async function legacyUser({ totp = false } = {}) {
  const { db, request } = productionCostAuth();
  await (totp ? signUpWithTotp : signUpWithEmail)(request, TEST_USER);
  const account = db.account.find((row) => row.providerId === 'credential');
  if (!account) throw new Error('no credential account');
  const legacyHash = await betterAuthDefaultHash(TEST_USER.password);
  account.password = legacyHash;
  return { request, account, legacyHash };
}

const signIn = (request: ReturnType<typeof createTestAuth>['request'], password: string) =>
  request('/sign-in/email', { body: { email: TEST_USER.email, password } });

describe('password hashing in Better Auth', () => {
  it('stores a new password at the OWASP cost unless told otherwise', SLOW, async () => {
    // `undefined` leaves createAuth's own default in place of the test instance's cheap hasher.
    const { db, request } = createTestAuth({ passwordHasher: undefined });
    await signUpWithEmail(request, TEST_USER);

    expect(db.account.find((row) => row.providerId === 'credential')?.password).toMatch(CURRENT_HASH);
  });
});

describe('password hash upgrade at sign-in', () => {
  it('signs in with a hash written before the change, then replaces it with one at the current cost', SLOW, async () => {
    const { request, account } = await legacyUser();

    const res = await signIn(request, TEST_USER.password);

    expect(res.status).toBe(200);
    expect(hasSessionCookie(res)).toBe(true);
    expect(account.password).toMatch(CURRENT_HASH);
    await expect(hasher.verify({ hash: String(account.password), password: TEST_USER.password })).resolves.toBe(true);
    // The upgraded hash keeps working.
    expect((await signIn(request, TEST_USER.password)).status).toBe(200);
  });

  it('upgrades once the password is right, even when a second factor follows', SLOW, async () => {
    const { request, account } = await legacyUser({ totp: true });

    const { twoFactorRedirect } = await startTwoFactorSignIn(request, TEST_USER);

    expect(twoFactorRedirect).toBe(true);
    expect(account.password).toMatch(CURRENT_HASH);
  });

  it('leaves the hash alone when the password is wrong', SLOW, async () => {
    const { request, account, legacyHash } = await legacyUser();

    const res = await signIn(request, 'Wrong-horse-9');

    expect(res.status).toBe(401);
    expect(account.password).toBe(legacyHash);
  });

  it('leaves a current hash as it is', SLOW, async () => {
    const { db, request } = productionCostAuth();
    await signUpWithEmail(request, TEST_USER);
    const account = db.account.find((row) => row.providerId === 'credential');
    const before = account?.password;

    expect((await signIn(request, TEST_USER.password)).status).toBe(200);
    expect(account?.password).toBe(before);
  });
});
