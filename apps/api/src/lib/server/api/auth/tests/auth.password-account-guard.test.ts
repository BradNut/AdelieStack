import { AUTH_SESSION_FRESH_AGE, AuthErrorCode, CREDENTIAL_PROVIDER_ID, SocialProvider } from '@adelie/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Auth } from '#lib/server/api/auth/auth.config';
import { AuthEndpoint } from '#lib/server/api/auth/auth.endpoints';
import { type AuthRequest, cookiesFrom, signUpWithEmail, signUpWithTotp, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const { email: EMAIL, password: PASSWORD } = TEST_USER;
const ACCOUNT_NOT_FOUND_CODE = 'ACCOUNT_NOT_FOUND';

let auth: Auth;
let db: Record<string, Record<string, unknown>[]>;
let request: AuthRequest;

beforeEach(() => {
  ({ auth, db, request } = createTestAuth({
    socialProviders: {
      // Token check and profile lookup answered locally, as in the social sign-in tests.
      github: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        verifyIdToken: async () => true,
        getUserInfo: async () =>
          ({
            user: { id: 'gh-1', email: EMAIL, emailVerified: true, name: 'Provider Name' },
            data: { sub: 'gh-1', id: 'gh-1' },
          }) as never,
      },
    },
  }));
});

async function signedInUserId(cookie: string) {
  const { user } = (await (await request('/get-session', { cookie })).json()) as { user: { id: string } };
  return user.id;
}

/** Gives the signed-in user a GitHub Sign-in Account next to their Password Account. Returns the user id. */
async function linkGithub(cookie: string) {
  const userId = await signedInUserId(cookie);
  await (await auth.$context).internalAdapter.updateUser(userId, { emailVerified: true });
  const link = await request('/link-social', { cookie, body: { provider: SocialProvider.GITHUB, idToken: { token: 't' } } });
  expect(link.status).toBe(200);
  return userId;
}

/** A user with a Password Account and GitHub, with or without a Second Factor enrolled. */
async function userWithGithub({ twoFactor }: { twoFactor: boolean }) {
  const { cookie } = await (twoFactor ? signUpWithTotp(request, TEST_USER) : signUpWithEmail(request, TEST_USER));
  return { cookie, id: await linkGithub(cookie) };
}

async function accountsOf(userId: string) {
  return (await auth.$context).internalAdapter.findAccounts(userId);
}

async function accountIdOf(userId: string, providerId: string) {
  return (await accountsOf(userId)).find((account) => account.providerId === providerId)?.id;
}

async function providerIdsOf(userId: string) {
  return (await accountsOf(userId)).map((account) => account.providerId).sort();
}

const unlink = (cookie: string, accountId: string | undefined) => request(AuthEndpoint.UNLINK_ACCOUNT, { cookie, body: { accountId } });

describe('unlinking the Password Account', () => {
  it('refuses to unlink the Password Account of a two-factor user', async () => {
    const user = await userWithGithub({ twoFactor: true });

    const res = await unlink(user.cookie, await accountIdOf(user.id, CREDENTIAL_PROVIDER_ID));

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(AuthErrorCode.PASSWORD_REQUIRED_FOR_TWO_FACTOR);
    expect(await providerIdsOf(user.id)).toEqual([CREDENTIAL_PROVIDER_ID, SocialProvider.GITHUB]);
  });

  it('refuses a two-factor user with a stale session straight away, without asking for re-authentication', async () => {
    const user = await userWithGithub({ twoFactor: true });
    for (const s of db.session) s.createdAt = new Date(Date.now() - (AUTH_SESSION_FRESH_AGE + 60) * 1000);

    const res = await unlink(user.cookie, await accountIdOf(user.id, CREDENTIAL_PROVIDER_ID));

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(AuthErrorCode.PASSWORD_REQUIRED_FOR_TWO_FACTOR);
    expect(await providerIdsOf(user.id)).toEqual([CREDENTIAL_PROVIDER_ID, SocialProvider.GITHUB]);
  });

  it('refuses a user with a Second Factor whose only Sign-in Account is the Password Account, and keeps that Password Account', async () => {
    const { cookie } = await signUpWithTotp(request, TEST_USER);
    const userId = await signedInUserId(cookie);

    const res = await unlink(cookie, await accountIdOf(userId, CREDENTIAL_PROVIDER_ID));

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(AuthErrorCode.PASSWORD_REQUIRED_FOR_TWO_FACTOR);
    expect(await providerIdsOf(userId)).toEqual([CREDENTIAL_PROVIDER_ID]);
  });

  it('unlinks the Password Account of a user without two-factor who has another Sign-in Account', async () => {
    const user = await userWithGithub({ twoFactor: false });

    const res = await unlink(user.cookie, await accountIdOf(user.id, CREDENTIAL_PROVIDER_ID));

    expect(res.status).toBe(200);
    expect(await providerIdsOf(user.id)).toEqual([SocialProvider.GITHUB]);
  });

  it('unlinks the Password Account once the user has disabled two-factor', async () => {
    const user = await userWithGithub({ twoFactor: true });
    const disable = await request('/two-factor/disable', { cookie: user.cookie, body: { password: PASSWORD } });
    expect(disable.status).toBe(200);

    const res = await unlink(cookiesFrom(disable, user.cookie), await accountIdOf(user.id, CREDENTIAL_PROVIDER_ID));

    expect(res.status).toBe(200);
    expect(await providerIdsOf(user.id)).toEqual([SocialProvider.GITHUB]);
  });
});

describe('other unlinks for a two-factor user', () => {
  it('unlinks a social Sign-in Account', async () => {
    const user = await userWithGithub({ twoFactor: true });

    const res = await unlink(user.cookie, await accountIdOf(user.id, SocialProvider.GITHUB));

    expect(res.status).toBe(200);
    expect(await providerIdsOf(user.id)).toEqual([CREDENTIAL_PROVIDER_ID]);
  });

  it("answers an unknown account id with Better Auth's own ACCOUNT_NOT_FOUND", async () => {
    const user = await userWithGithub({ twoFactor: true });

    const res = await unlink(user.cookie, 'unknown-account-id');

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(ACCOUNT_NOT_FOUND_CODE);
    expect(await providerIdsOf(user.id)).toEqual([CREDENTIAL_PROVIDER_ID, SocialProvider.GITHUB]);
  });

  it("answers a missing account id with Better Auth's own validation error", async () => {
    const user = await userWithGithub({ twoFactor: true });

    const res = await request(AuthEndpoint.UNLINK_ACCOUNT, { cookie: user.cookie, body: {} });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('VALIDATION_ERROR');
    expect(await providerIdsOf(user.id)).toEqual([CREDENTIAL_PROVIDER_ID, SocialProvider.GITHUB]);
  });
});

describe("unlinking another user's Sign-in Account", () => {
  /**
   * The signed-in user holds two Sign-in Accounts, because Better Auth refuses a user with only one before it looks up
   * the account id. GitHub's mocked profile is fixed to `TEST_USER`, so the other user's GitHub account is seeded.
   */
  async function twoFactorCookieAndOtherGithubUserId() {
    const signedIn = await userWithGithub({ twoFactor: true });
    const { cookie } = await signUpWithEmail(request, { ...TEST_USER, email: 'other-user@example.com' });
    const otherUserId = await signedInUserId(cookie);
    await (await auth.$context).internalAdapter.linkAccount({ userId: otherUserId, providerId: SocialProvider.GITHUB, accountId: 'gh-2' });
    return { cookie: signedIn.cookie, otherUserId };
  }

  it.each([
    ['Password Account', CREDENTIAL_PROVIDER_ID],
    ['social Sign-in Account', SocialProvider.GITHUB],
  ])("answers Better Auth's own ACCOUNT_NOT_FOUND when a user with a Second Factor targets another user's %s", async (_, providerId) => {
    const { cookie, otherUserId } = await twoFactorCookieAndOtherGithubUserId();

    const res = await unlink(cookie, await accountIdOf(otherUserId, providerId));

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(ACCOUNT_NOT_FOUND_CODE);
    expect(await providerIdsOf(otherUserId)).toEqual([CREDENTIAL_PROVIDER_ID, SocialProvider.GITHUB]);
  });
});

describe('unlinking without a session', () => {
  it("answers with Better Auth's own unauthenticated error", async () => {
    const user = await userWithGithub({ twoFactor: true });
    const accountId = await accountIdOf(user.id, CREDENTIAL_PROVIDER_ID);

    const res = await request(AuthEndpoint.UNLINK_ACCOUNT, { body: { accountId } });

    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe('UNAUTHORIZED');
    expect(await providerIdsOf(user.id)).toEqual([CREDENTIAL_PROVIDER_ID, SocialProvider.GITHUB]);
  });
});
