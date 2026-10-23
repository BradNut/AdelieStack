import { SocialProvider } from '@adelie/shared';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '#lib/server/api/auth/auth.config';
import { enabledSocialProviders, socialCredentialsFromEnvs } from '#lib/server/api/auth/auth.social';
import { envsDto } from '#lib/server/api/common/configs/dtos/env.dto';
import { validEnvs } from '#lib/server/api/common/configs/tests/env-fixtures';
import { cookiesFrom } from '../../../../../test/auth-http';

const ORIGIN = 'http://localhost:5173';
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

function buildAuth(options: { signUpEnabled: boolean; google?: FakeProfile; github?: FakeProfile }): Auth {
  return createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], twoFactor: [], passkey: [] }),
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    twoFactorIssuer: 'AdelieStack',
    passkey: { rpID: 'localhost', rpName: 'AdelieStack', origin: ORIGIN },
    mailer: { send: async () => {} },
    signUpEnabled: options.signUpEnabled,
    hibpEnabled: false,
    socialProviders: {
      ...(options.google && { google: fakeProvider(options.google) }),
      ...(options.github && { github: fakeProvider(options.github) }),
    },
  });
}

function post(auth: Auth, path: string, body: unknown, cookie?: string) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: 'POST',
      headers: new Headers({ origin: ORIGIN, 'content-type': 'application/json', ...(cookie && { cookie }) }),
      body: JSON.stringify(body),
    }),
  );
}

const socialSignIn = (auth: Auth, provider: SocialProvider) => post(auth, '/sign-in/social', { provider, idToken: { token: 'provider-token' } });

/** Registers EXISTING_EMAIL with a password and, optionally, a verified address. Returns the user id and a session cookie. */
async function existingUser(auth: Auth, { verified }: { verified: boolean }) {
  const { user } = await auth.api.createUser({ body: { name: 'Member', email: EXISTING_EMAIL, password: PASSWORD, role: 'user' } });
  const { internalAdapter } = await auth.$context;
  await internalAdapter.updateUser(user.id, { emailVerified: verified });
  const signIn = await post(auth, '/sign-in/email', { email: EXISTING_EMAIL, password: PASSWORD });
  return { id: user.id, cookie: cookiesFrom(signIn) };
}

async function providerIdsOf(auth: Auth, userId: string) {
  const { internalAdapter } = await auth.$context;
  return (await internalAdapter.findAccounts(userId)).map((account) => account.providerId).sort();
}

describe('provider registration', () => {
  it('registers no provider when no credentials are configured', async () => {
    const auth = createAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [], twoFactor: [], passkey: [] }),
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: ORIGIN,
      trustedOrigins: [ORIGIN],
      twoFactorIssuer: 'AdelieStack',
      passkey: { rpID: 'localhost', rpName: 'AdelieStack', origin: ORIGIN },
      mailer: { send: async () => {} },
      signUpEnabled: true,
      hibpEnabled: false,
      socialProviders: socialCredentialsFromEnvs(envsDto.parse(validEnvs)),
    });

    expect((await auth.$context).socialProviders).toEqual([]);
    expect((await socialSignIn(auth, SocialProvider.GITHUB)).status).toBe(404);
  });

  it('registers exactly the providers whose credentials are configured', async () => {
    const credentials = socialCredentialsFromEnvs(envsDto.parse({ ...validEnvs, GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' }));
    const auth = createAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [], twoFactor: [], passkey: [] }),
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: ORIGIN,
      trustedOrigins: [ORIGIN],
      twoFactorIssuer: 'AdelieStack',
      passkey: { rpID: 'localhost', rpName: 'AdelieStack', origin: ORIGIN },
      mailer: { send: async () => {} },
      signUpEnabled: true,
      hibpEnabled: false,
      socialProviders: credentials,
    });

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
    const auth = buildAuth({ signUpEnabled: false, google: profile({}) });
    const member = await existingUser(auth, { verified: true });

    const res = await socialSignIn(auth, SocialProvider.GOOGLE);

    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { id: string } }).user.id).toBe(member.id);
    expect(await providerIdsOf(auth, member.id)).toEqual(['credential', 'google']);
  });

  it('does not link when the provider reports the email as unverified', async () => {
    const auth = buildAuth({ signUpEnabled: true, google: profile({ emailVerified: false }) });
    const member = await existingUser(auth, { verified: true });

    const res = await socialSignIn(auth, SocialProvider.GOOGLE);

    expect(res.ok).toBe(false);
    expect(await providerIdsOf(auth, member.id)).toEqual(['credential']);
  });

  it('does not link when the existing account has not verified its own email', async () => {
    const auth = buildAuth({ signUpEnabled: true, google: profile({}) });
    const member = await existingUser(auth, { verified: false });

    const res = await socialSignIn(auth, SocialProvider.GOOGLE);

    expect(res.ok).toBe(false);
    expect(await providerIdsOf(auth, member.id)).toEqual(['credential']);
  });

  it('creates a separate account for a different email instead of linking', async () => {
    const auth = buildAuth({ signUpEnabled: true, google: profile({ email: 'someone-else@example.com' }) });
    const member = await existingUser(auth, { verified: true });

    const res = await socialSignIn(auth, SocialProvider.GOOGLE);

    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { id: string } }).user.id).not.toBe(member.id);
    expect(await providerIdsOf(auth, member.id)).toEqual(['credential']);
  });

  it('refuses to link a provider account with a different email to a signed-in user', async () => {
    const auth = buildAuth({ signUpEnabled: false, github: profile({ id: 'gh-1', email: 'other@example.com' }) });
    const member = await existingUser(auth, { verified: true });

    const res = await post(auth, '/link-social', { provider: SocialProvider.GITHUB, idToken: { token: 't' } }, member.cookie);

    expect(res.ok).toBe(false);
    expect(await providerIdsOf(auth, member.id)).toEqual(['credential']);
  });
});

describe('link and unlink from account settings', () => {
  it('links a provider with the same verified email, then unlinks it', async () => {
    const auth = buildAuth({ signUpEnabled: false, github: { id: 'gh-1', email: EXISTING_EMAIL, emailVerified: true } });
    const member = await existingUser(auth, { verified: true });

    const link = await post(auth, '/link-social', { provider: SocialProvider.GITHUB, idToken: { token: 't' } }, member.cookie);
    expect(link.status).toBe(200);
    expect(await providerIdsOf(auth, member.id)).toEqual(['credential', 'github']);

    const { internalAdapter } = await auth.$context;
    const github = (await internalAdapter.findAccounts(member.id)).find((account) => account.providerId === SocialProvider.GITHUB);
    const unlink = await post(auth, '/unlink-account', { accountId: github?.id }, member.cookie);

    expect(unlink.status).toBe(200);
    expect(await providerIdsOf(auth, member.id)).toEqual(['credential']);
  });

  it('refuses to unlink the last sign-in method', async () => {
    const auth = buildAuth({ signUpEnabled: true, google: { id: 'g-1', email: 'new@example.com', emailVerified: true } });
    const signIn = await socialSignIn(auth, SocialProvider.GOOGLE);
    const { user } = (await signIn.json()) as { user: { id: string } };
    const { internalAdapter } = await auth.$context;
    const [only] = await internalAdapter.findAccounts(user.id);

    const res = await post(auth, '/unlink-account', { accountId: only?.id }, cookiesFrom(signIn));

    expect(res.status).toBe(400);
    expect(await providerIdsOf(auth, user.id)).toEqual([SocialProvider.GOOGLE]);
  });
});

describe('sign-up gate for social sign-in', () => {
  const stranger: FakeProfile = { id: 'google-sub-9', email: 'stranger@example.com', emailVerified: true };

  it('rejects an unknown email while sign-up is closed and creates no user', async () => {
    const auth = buildAuth({ signUpEnabled: false, google: stranger });

    const res = await socialSignIn(auth, SocialProvider.GOOGLE);

    expect(res.ok).toBe(false);
    const { internalAdapter } = await auth.$context;
    expect(await internalAdapter.findUserByEmail(stranger.email)).toBeNull();
  });

  it('still rejects an unknown email when the client asks to sign up', async () => {
    const auth = buildAuth({ signUpEnabled: false, google: stranger });

    const res = await post(auth, '/sign-in/social', { provider: SocialProvider.GOOGLE, idToken: { token: 't' }, requestSignUp: true });

    expect(res.ok).toBe(false);
  });

  it('lets an existing user sign in socially while sign-up is closed', async () => {
    const auth = buildAuth({ signUpEnabled: false, google: { id: 'g-2', email: EXISTING_EMAIL, emailVerified: true } });
    const member = await existingUser(auth, { verified: true });
    await socialSignIn(auth, SocialProvider.GOOGLE);

    const again = await socialSignIn(auth, SocialProvider.GOOGLE);

    expect(again.status).toBe(200);
    expect(((await again.json()) as { user: { id: string } }).user.id).toBe(member.id);
  });

  it('creates the user for an unknown email while sign-up is open', async () => {
    const auth = buildAuth({ signUpEnabled: true, google: stranger });

    const res = await socialSignIn(auth, SocialProvider.GOOGLE);

    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { email: string } }).user.email).toBe(stranger.email);
  });

  it('gates every registered provider, whichever way it signs in', async () => {
    const auth = buildAuth({ signUpEnabled: false, google: stranger, github: { ...stranger, id: 'gh-9' } });

    const providers = (await auth.$context).socialProviders;

    expect(providers.map((provider) => provider.id).sort()).toEqual([SocialProvider.GITHUB, SocialProvider.GOOGLE]);
    for (const provider of providers) expect(provider.options?.disableSignUp).toBe(true);
  });
});
