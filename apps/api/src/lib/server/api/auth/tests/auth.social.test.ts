import { SocialProvider } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import type { Auth } from '#lib/server/api/auth/auth.config';
import { enabledSocialProviders, socialCredentialsFromEnvs } from '#lib/server/api/auth/auth.social';
import { envsDto } from '#lib/server/api/common/configs/dtos/env.dto';
import { validEnvs } from '#lib/server/api/common/configs/tests/env-fixtures';
import { type AuthRequest, cookiesFrom } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const PASSWORD = 'Correct-horse-9';
const EXISTING_EMAIL = 'member@example.com';

interface FakeProfile {
  id: string;
  email: string;
  emailVerified: boolean;
}

/**
 * A provider whose token check and profile lookup are answered locally, so the real Better Auth
 * sign-in, linking and sign-up code runs without reaching GitHub or Google.
 */
function fakeProvider(profile: FakeProfile) {
  return {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    verifyIdToken: async () => true,
    // Each provider types its user info and raw profile differently; Better Auth only passes them through.
    getUserInfo: async () =>
      ({
        user: { id: profile.id, email: profile.email, emailVerified: profile.emailVerified, name: 'Provider Name' },
        data: { sub: profile.id, id: profile.id },
      }) as never,
  };
}

function buildAuth(options: { signUpEnabled: boolean; google?: FakeProfile; github?: FakeProfile }) {
  return createTestAuth({
    signUpEnabled: options.signUpEnabled,
    socialProviders: {
      ...(options.google && { google: fakeProvider(options.google) }),
      ...(options.github && { github: fakeProvider(options.github) }),
    },
  });
}

const socialSignIn = (request: AuthRequest, provider: SocialProvider) =>
  request('/sign-in/social', { body: { provider, idToken: { token: 'provider-token' } } });

/** Registers EXISTING_EMAIL with a password and, optionally, a verified address. Returns the user id and a session cookie. */
async function existingUser(auth: Auth, request: AuthRequest, { verified }: { verified: boolean }) {
  const { user } = await auth.api.createUser({ body: { name: 'Member', email: EXISTING_EMAIL, password: PASSWORD, role: 'user' } });
  const { internalAdapter } = await auth.$context;
  await internalAdapter.updateUser(user.id, { emailVerified: verified });
  const signIn = await request('/sign-in/email', { body: { email: EXISTING_EMAIL, password: PASSWORD } });
  return { id: user.id, cookie: cookiesFrom(signIn) };
}

async function providerIdsOf(auth: Auth, userId: string) {
  const { internalAdapter } = await auth.$context;
  return (await internalAdapter.findAccounts(userId)).map((account) => account.providerId).sort();
}

describe('provider registration', () => {
  it('registers no provider when no credentials are configured', async () => {
    const { auth, request } = createTestAuth({ socialProviders: socialCredentialsFromEnvs(envsDto.parse(validEnvs)) });

    expect((await auth.$context).socialProviders).toEqual([]);
    expect((await socialSignIn(request, SocialProvider.GITHUB)).status).toBe(404);
  });

  it('registers exactly the providers whose credentials are configured', async () => {
    const credentials = socialCredentialsFromEnvs(envsDto.parse({ ...validEnvs, GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' }));
    const { auth } = createTestAuth({ socialProviders: credentials });

    expect((await auth.$context).socialProviders.map((provider) => provider.id)).toEqual([SocialProvider.GITHUB]);
    expect(enabledSocialProviders(credentials)).toEqual([SocialProvider.GITHUB]);
  });

  it('registers both providers when both are configured', () => {
    const credentials = socialCredentialsFromEnvs(
      envsDto.parse({ ...validEnvs, GITHUB_CLIENT_ID: 'a', GITHUB_CLIENT_SECRET: 'b', GOOGLE_CLIENT_ID: 'c', GOOGLE_CLIENT_SECRET: 'd' }),
    );

    expect(enabledSocialProviders(credentials)).toEqual([SocialProvider.GITHUB, SocialProvider.GOOGLE]);
  });
});

describe('account linking on social sign-in', () => {
  const profile = (overrides: Partial<FakeProfile>): FakeProfile => ({
    id: 'google-sub-1',
    email: EXISTING_EMAIL,
    emailVerified: true,
    ...overrides,
  });

  it('links to the existing account when the provider verified the matching email', async () => {
    const { auth, request } = buildAuth({ signUpEnabled: false, google: profile({}) });
    const member = await existingUser(auth, request, { verified: true });

    const res = await socialSignIn(request, SocialProvider.GOOGLE);

    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { id: string } }).user.id).toBe(member.id);
    expect(await providerIdsOf(auth, member.id)).toEqual(['credential', 'google']);
  });

  it('does not link when the provider reports the email as unverified', async () => {
    const { auth, request } = buildAuth({ signUpEnabled: true, google: profile({ emailVerified: false }) });
    const member = await existingUser(auth, request, { verified: true });

    const res = await socialSignIn(request, SocialProvider.GOOGLE);

    expect(res.ok).toBe(false);
    expect(await providerIdsOf(auth, member.id)).toEqual(['credential']);
  });

  it('does not link when the existing account has not verified its own email', async () => {
    const { auth, request } = buildAuth({ signUpEnabled: true, google: profile({}) });
    const member = await existingUser(auth, request, { verified: false });

    const res = await socialSignIn(request, SocialProvider.GOOGLE);

    expect(res.ok).toBe(false);
    expect(await providerIdsOf(auth, member.id)).toEqual(['credential']);
  });

  it('creates a separate account for a different email instead of linking', async () => {
    const { auth, request } = buildAuth({ signUpEnabled: true, google: profile({ email: 'someone-else@example.com' }) });
    const member = await existingUser(auth, request, { verified: true });

    const res = await socialSignIn(request, SocialProvider.GOOGLE);

    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { id: string } }).user.id).not.toBe(member.id);
    expect(await providerIdsOf(auth, member.id)).toEqual(['credential']);
  });

  it('refuses to link a provider account with a different email to a signed-in user', async () => {
    const { auth, request } = buildAuth({ signUpEnabled: false, github: profile({ id: 'gh-1', email: 'other@example.com' }) });
    const member = await existingUser(auth, request, { verified: true });

    const res = await request('/link-social', { cookie: member.cookie, body: { provider: SocialProvider.GITHUB, idToken: { token: 't' } } });

    expect(res.ok).toBe(false);
    expect(await providerIdsOf(auth, member.id)).toEqual(['credential']);
  });
});

describe('link and unlink from account settings', () => {
  it('links a provider with the same verified email, then unlinks it', async () => {
    const { auth, request } = buildAuth({ signUpEnabled: false, github: { id: 'gh-1', email: EXISTING_EMAIL, emailVerified: true } });
    const member = await existingUser(auth, request, { verified: true });

    const link = await request('/link-social', { cookie: member.cookie, body: { provider: SocialProvider.GITHUB, idToken: { token: 't' } } });
    expect(link.status).toBe(200);
    expect(await providerIdsOf(auth, member.id)).toEqual(['credential', 'github']);

    const { internalAdapter } = await auth.$context;
    const github = (await internalAdapter.findAccounts(member.id)).find((account) => account.providerId === SocialProvider.GITHUB);
    const unlink = await request('/unlink-account', { cookie: member.cookie, body: { accountId: github?.id } });

    expect(unlink.status).toBe(200);
    expect(await providerIdsOf(auth, member.id)).toEqual(['credential']);
  });

  it('refuses to unlink the last sign-in method', async () => {
    const { auth, request } = buildAuth({ signUpEnabled: true, google: { id: 'g-1', email: 'new@example.com', emailVerified: true } });
    const signIn = await socialSignIn(request, SocialProvider.GOOGLE);
    const { user } = (await signIn.json()) as { user: { id: string } };
    const { internalAdapter } = await auth.$context;
    const [only] = await internalAdapter.findAccounts(user.id);

    const res = await request('/unlink-account', { cookie: cookiesFrom(signIn), body: { accountId: only?.id } });

    expect(res.status).toBe(400);
    expect(await providerIdsOf(auth, user.id)).toEqual([SocialProvider.GOOGLE]);
  });
});

describe('sign-up gate for social sign-in', () => {
  const stranger: FakeProfile = { id: 'google-sub-9', email: 'stranger@example.com', emailVerified: true };

  it('rejects an unknown email while sign-up is closed and creates no user', async () => {
    const { auth, request } = buildAuth({ signUpEnabled: false, google: stranger });

    const res = await socialSignIn(request, SocialProvider.GOOGLE);

    expect(res.ok).toBe(false);
    const { internalAdapter } = await auth.$context;
    expect(await internalAdapter.findUserByEmail(stranger.email)).toBeNull();
  });

  it('still rejects an unknown email when the client asks to sign up', async () => {
    const { request } = buildAuth({ signUpEnabled: false, google: stranger });

    const res = await request('/sign-in/social', { body: { provider: SocialProvider.GOOGLE, idToken: { token: 't' }, requestSignUp: true } });

    expect(res.ok).toBe(false);
  });

  it('lets an existing user sign in socially while sign-up is closed', async () => {
    const { auth, request } = buildAuth({ signUpEnabled: false, google: { id: 'g-2', email: EXISTING_EMAIL, emailVerified: true } });
    const member = await existingUser(auth, request, { verified: true });
    await socialSignIn(request, SocialProvider.GOOGLE);

    const again = await socialSignIn(request, SocialProvider.GOOGLE);

    expect(again.status).toBe(200);
    expect(((await again.json()) as { user: { id: string } }).user.id).toBe(member.id);
  });

  it('creates the user for an unknown email while sign-up is open', async () => {
    const { request } = buildAuth({ signUpEnabled: true, google: stranger });

    const res = await socialSignIn(request, SocialProvider.GOOGLE);

    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { email: string } }).user.email).toBe(stranger.email);
  });

  it('gates every registered provider, whichever way it signs in', async () => {
    const { auth } = buildAuth({ signUpEnabled: false, google: stranger, github: { ...stranger, id: 'gh-9' } });

    const providers = (await auth.$context).socialProviders;

    expect(providers.map((provider) => provider.id).sort()).toEqual([SocialProvider.GITHUB, SocialProvider.GOOGLE]);
    for (const provider of providers) expect(provider.options?.disableSignUp).toBe(true);
  });
});
