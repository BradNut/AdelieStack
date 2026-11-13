import { PASSWORD_CHECK_UNAVAILABLE, PASSWORD_COMPROMISED, PASSWORD_POLICY_VIOLATION } from '@adelie/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHibpHealth } from '#lib/server/api/auth/auth.hibp-status';
import { type AuthRequest, cookiesFrom, resetToken, signUpWithEmail, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';
import { mockHibp, PWNED_PASSWORD } from '../../../../../test/mocks/hibp.mock';

const { email: EMAIL, password: PASSWORD } = TEST_USER;
const NEW_PASSWORD = 'another long passphrase';
const OTHER_USER = { ...TEST_USER, email: 'other@example.com' };

let db: ReturnType<typeof createTestAuth>['db'];
let mailer: ReturnType<typeof createTestAuth>['mailer'];
let request: AuthRequest;

beforeEach(() => {
  ({ db, mailer, request } = createTestAuth());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function signIn(password = PASSWORD) {
  const res = await request('/sign-in/email', { body: { email: EMAIL, password } });
  expect(res.status).toBe(200);
  return cookiesFrom(res);
}

async function isSignedIn(cookie: string) {
  return (await (await request('/get-session', { cookie })).json()) !== null;
}

function reset(token: string, newPassword = NEW_PASSWORD) {
  return request('/reset-password', { body: { newPassword, token } });
}

async function signedInWithLink() {
  const { cookie } = await signUpWithEmail(request, TEST_USER);
  return { cookie, token: await resetToken(request, mailer.sent) };
}

/** As {@link signedInWithLink}, on an instance that screens for breached passwords. */
async function signedInWithScreenedLink() {
  ({ db, mailer, request } = createTestAuth({ hibpStatus: createHibpHealth({ enabled: true }) }));
  mockHibp([]);
  return signedInWithLink();
}

describe('a successful password reset', () => {
  it('ends every session the account held', async () => {
    const { cookie: first } = await signUpWithEmail(request, TEST_USER);
    const second = await signIn();
    expect(await isSignedIn(first)).toBe(true);
    expect(await isSignedIn(second)).toBe(true);

    expect((await reset(await resetToken(request, mailer.sent))).status).toBe(200);

    expect(await isSignedIn(first)).toBe(false);
    expect(await isSignedIn(second)).toBe(false);
  });

  it('leaves the sessions of other accounts alone', async () => {
    await signUpWithEmail(request, TEST_USER);
    const { cookie: other } = await signUpWithEmail(request, OTHER_USER);

    await reset(await resetToken(request, mailer.sent));

    expect(await isSignedIn(other)).toBe(true);
  });

  it('lets the user sign in with the new password, and not the old one', async () => {
    await signUpWithEmail(request, TEST_USER);

    await reset(await resetToken(request, mailer.sent));

    expect(await isSignedIn(await signIn(NEW_PASSWORD))).toBe(true);
    expect((await request('/sign-in/email', { body: { email: EMAIL, password: PASSWORD } })).status).toBe(401);
  });

  it('ends no session of a later sign-in when the spent link is replayed', async () => {
    await signUpWithEmail(request, TEST_USER);
    const token = await resetToken(request, mailer.sent);
    await reset(token);
    const signedInAfter = await signIn(NEW_PASSWORD);

    expect((await reset(token, 'yet another long passphrase')).status).toBe(400);

    expect(await isSignedIn(signedInAfter)).toBe(true);
  });

  it('ends every session when a good password follows a breached one on the same link', async () => {
    const { cookie, token } = await signedInWithScreenedLink();
    mockHibp([PWNED_PASSWORD]);
    await reset(token, PWNED_PASSWORD);

    expect((await reset(token)).status).toBe(200);

    expect(await isSignedIn(cookie)).toBe(false);
  });
});

describe('a failed password reset ends no session', () => {
  it('for an unknown token', async () => {
    const { cookie } = await signedInWithLink();

    expect((await reset('not-a-real-token')).status).toBe(400);

    expect(await isSignedIn(cookie)).toBe(true);
  });

  it('for an expired token', async () => {
    const { cookie, token } = await signedInWithLink();
    for (const row of db.verification) row.expiresAt = new Date(Date.now() - 1000);

    expect((await reset(token)).status).toBe(400);

    expect(await isSignedIn(cookie)).toBe(true);
  });

  it('for a missing token', async () => {
    const { cookie } = await signedInWithLink();

    expect((await request('/reset-password', { body: { newPassword: NEW_PASSWORD } })).status).toBe(400);

    expect(await isSignedIn(cookie)).toBe(true);
  });

  it('for a password the policy rejects', async () => {
    const { cookie, token } = await signedInWithLink();

    const res = await reset(token, 'short');

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(PASSWORD_POLICY_VIOLATION);
    expect(await isSignedIn(cookie)).toBe(true);
  });

  describe('with breached-password screening on', () => {
    it('for a breached password', async () => {
      const { cookie, token } = await signedInWithScreenedLink();
      mockHibp([PWNED_PASSWORD]);

      const res = await reset(token, PWNED_PASSWORD);

      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe(PASSWORD_COMPROMISED);
      expect(await isSignedIn(cookie)).toBe(true);
    });

    it('when the breached-password check is unreachable', async () => {
      const { cookie, token } = await signedInWithScreenedLink();
      mockHibp([], 503);

      const res = await reset(token);

      expect(res.status).toBe(503);
      expect(((await res.json()) as { code: string }).code).toBe(PASSWORD_CHECK_UNAVAILABLE);
      expect(await isSignedIn(cookie)).toBe(true);
    });
  });
});
