import { AppRoute, AuthErrorCode, CREDENTIAL_PROVIDER_ID, SocialProvider } from '@adelie/shared';
import { totpCode } from '@adelie/test-utils/totp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cookiesFrom, emailedOtp, signUpWithEmail, signUpWithTotp, startTwoFactorSignIn, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth, stubGoogleUserInfo, TEST_ORIGIN } from '../../../../../test/auth-instance';
import { createPasskeyAuthenticator } from '../../../../../test/passkey-authenticator';
import { AuthEndpoint } from '../auth.endpoints';

const { email: EMAIL } = TEST_USER;
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CHALLENGE_COOKIE = 'two_factor=';
const CHALLENGE_LIFETIME_MS = 600_000;
/** Better Auth's limit of wrong codes per challenge; it does not export the number. */
const CHALLENGE_ATTEMPT_LIMIT = 5;
const GOOGLE_CALLBACK_PATH = AuthEndpoint.SOCIAL_CALLBACK.replace(':id', SocialProvider.GOOGLE);

/**
 * A test auth harness with Google answered locally: the profile is EMAIL, verified; a code exchange succeeds unless
 * `codeAccepted` is false, and an id token is accepted unless `idTokenAccepted` is false.
 */
function createGoogleStubbedAuth({ codeAccepted = true, idTokenAccepted = true } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url !== GOOGLE_TOKEN_ENDPOINT) throw new Error(`unexpected network call: ${url}`);
      return codeAccepted
        ? Response.json({ access_token: 'access', token_type: 'Bearer', expires_in: 3600 })
        : Response.json({ error: 'invalid_grant' }, { status: 400 });
    }),
  );
  const testAuth = createTestAuth({
    socialProviders: {
      google: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        verifyIdToken: async () => idTokenAccepted,
        getUserInfo: stubGoogleUserInfo(EMAIL),
      },
    },
  });
  const isSignedIn = async (cookie: string) => (await (await testAuth.request('/get-session', { cookie })).json()) !== null;
  return { ...testAuth, isSignedIn };
}

type TestAuth = ReturnType<typeof createGoogleStubbedAuth>;

/** A two-factor user whose email is verified, so a provider with the same verified email links to the account. */
async function twoFactorUser(t: TestAuth) {
  const enrolled = await signUpWithTotp(t.request, TEST_USER);
  markEmailsVerified(t);
  return enrolled;
}

function markEmailsVerified(t: TestAuth) {
  for (const user of t.db.user) user.emailVerified = true;
}

/** Sends the browser to the provider and back with a code, as a sign-in from the app (or `/link-social` from settings). */
async function providerRoundTrip(
  t: TestAuth,
  { cookie = '', path = AuthEndpoint.SIGN_IN_SOCIAL as string, callbackURL = AppRoute.HOME as string } = {},
) {
  const start = await t.request(path, { cookie, body: { provider: SocialProvider.GOOGLE, callbackURL, errorCallbackURL: AppRoute.LOGIN } });
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get('state') ?? '';
  const browser = cookiesFrom(start, cookie);
  const callback = await t.request(`${GOOGLE_CALLBACK_PATH}?code=provider-code&state=${encodeURIComponent(state)}`, { cookie: browser });
  return { start, callback, browser };
}

/** A provider round trip that reached the Two-factor Challenge: the browser's cookies afterwards. */
async function socialChallenge(t: TestAuth, cookie = '') {
  const { callback, browser } = await providerRoundTrip(t, { cookie });
  return cookiesFrom(callback, browser);
}

const idTokenSignIn = (t: TestAuth, cookie?: string) =>
  t.request(AuthEndpoint.SIGN_IN_SOCIAL, { cookie, body: { provider: SocialProvider.GOOGLE, idToken: { token: 'provider-token' } } });

const verifyTotp = (t: TestAuth, cookie: string, code: string) => t.request('/two-factor/verify-totp', { cookie, body: { code } });

/** A 6-digit code that is not the current one, so it is always wrong. */
function wrongCode(totpURI: string) {
  return totpCode(totpURI) === '000000' ? '111111' : '000000';
}

const errorCode = async (res: Response) => ((await res.json()) as { code?: string }).code;

const twoFactorRedirect = async (res: Response) => ((await res.json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('provider callback for a two-factor user', () => {
  it('redirects to the Two-factor Challenge with a challenge cookie, and leaves no session', async () => {
    const t = createGoogleStubbedAuth();
    await twoFactorUser(t);
    const sessionsBefore = t.db.session.length;

    const { callback, browser } = await providerRoundTrip(t);

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe(AppRoute.LOGIN_TWO_FACTOR);
    expect(await callback.text()).toBe('');
    const after = cookiesFrom(callback, browser);
    expect(after).toContain(CHALLENGE_COOKIE);
    expect(await t.isSignedIn(after)).toBe(false);
    expect(t.db.session).toHaveLength(sessionsBefore);
  });

  it('tells the browser to drop the session cookie the callback had set', async () => {
    const t = createGoogleStubbedAuth();
    await twoFactorUser(t);
    const { sessionToken } = (await t.auth.$context).authCookies;

    const { callback } = await providerRoundTrip(t);

    const sessionCookies = callback.headers.getSetCookie().filter((cookie) => cookie.startsWith(`${sessionToken.name}=`));
    expect(sessionCookies.at(-1)).toContain('Max-Age=0');
    expect(callback.headers.getSetCookie().filter((cookie) => cookie.includes(CHALLENGE_COOKIE))).toHaveLength(1);
  });

  it('carries no return path, whatever callback the sign-in asked for', async () => {
    const t = createGoogleStubbedAuth();
    await twoFactorUser(t);

    const { callback } = await providerRoundTrip(t, { callbackURL: `${TEST_ORIGIN}${AppRoute.SETTINGS_SECURITY}` });

    expect(callback.headers.get('location')).toBe(AppRoute.LOGIN_TWO_FACTOR);
  });

  it('starts no challenge when the sign-in only asks for the provider URL', async () => {
    const t = createGoogleStubbedAuth();
    await twoFactorUser(t);

    const { start } = await providerRoundTrip(t);

    expect(start.status).toBe(200);
    expect(cookiesFrom(start)).not.toContain(CHALLENGE_COOKIE);
  });

  it('sends a refused sign-in to the error page and raises no challenge', async () => {
    const t = createGoogleStubbedAuth({ codeAccepted: false });
    await twoFactorUser(t);

    const { callback } = await providerRoundTrip(t);

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toContain(`${AppRoute.LOGIN}?error=`);
    expect(cookiesFrom(callback)).not.toContain(CHALLENGE_COOKIE);
  });

  it('requires the challenge on a hand-crafted re-authentication from a signed-in browser', async () => {
    const t = createGoogleStubbedAuth();
    const { cookie } = await twoFactorUser(t);

    const { callback, browser } = await providerRoundTrip(t, { cookie, callbackURL: AppRoute.SETTINGS_SECURITY });

    expect(callback.headers.get('location')).toBe(AppRoute.LOGIN_TWO_FACTOR);
    expect(await t.isSignedIn(cookiesFrom(callback, browser))).toBe(false);
  });
});

describe('completing the challenge after a provider callback', () => {
  it('creates a session with an authenticator code', async () => {
    const t = createGoogleStubbedAuth();
    const { totpURI } = await twoFactorUser(t);
    const challenge = await socialChallenge(t);

    const res = await verifyTotp(t, challenge, totpCode(totpURI));

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(cookiesFrom(res, challenge))).toBe(true);
  });

  it('creates a session with an emailed code', async () => {
    const t = createGoogleStubbedAuth();
    await twoFactorUser(t);
    const challenge = await socialChallenge(t);
    await t.request('/two-factor/send-otp', { cookie: challenge, body: {} });
    const otp = emailedOtp(t.mailer.sent.at(-1));

    const res = await t.request('/two-factor/verify-otp', { cookie: challenge, body: { code: otp } });

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(cookiesFrom(res, challenge))).toBe(true);
  });

  it('creates a session with a Recovery Code', async () => {
    const t = createGoogleStubbedAuth();
    const { backupCodes } = await twoFactorUser(t);
    const challenge = await socialChallenge(t);

    const res = await t.request(AuthEndpoint.VERIFY_BACKUP_CODE, { cookie: challenge, body: { code: backupCodes[0] } });

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(cookiesFrom(res, challenge))).toBe(true);
  });

  it('rejects a wrong code and creates no session', async () => {
    const t = createGoogleStubbedAuth();
    const { totpURI } = await twoFactorUser(t);
    const sessionsBefore = t.db.session.length;
    const challenge = await socialChallenge(t);

    const res = await verifyTotp(t, challenge, wrongCode(totpURI));

    expect(res.ok).toBe(false);
    expect(await t.isSignedIn(cookiesFrom(res, challenge))).toBe(false);
    expect(t.db.session).toHaveLength(sessionsBefore);
  });

  it('ends once the challenge expires, as after a password', async () => {
    const t = createGoogleStubbedAuth();
    const { totpURI } = await twoFactorUser(t);
    const challenge = await socialChallenge(t);
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + CHALLENGE_LIFETIME_MS + 1 });

    const res = await verifyTotp(t, challenge, totpCode(totpURI));

    expect(res.ok).toBe(false);
    expect(await errorCode(res)).toBe(AuthErrorCode.TWO_FACTOR_CHALLENGE_INVALID);
  });

  it('ends after too many wrong codes, as after a password', async () => {
    const t = createGoogleStubbedAuth();
    const { totpURI } = await twoFactorUser(t);
    const challenge = await socialChallenge(t);
    for (let attempt = 0; attempt < CHALLENGE_ATTEMPT_LIMIT; attempt++) await verifyTotp(t, challenge, wrongCode(totpURI));

    const res = await verifyTotp(t, challenge, totpCode(totpURI));

    expect(await errorCode(res)).toBe(AuthErrorCode.TWO_FACTOR_ATTEMPTS_EXHAUSTED);
    expect(await t.isSignedIn(cookiesFrom(res, challenge))).toBe(false);
  });

  it('locks the account after repeated wrong codes, as after a password', async () => {
    const t = createGoogleStubbedAuth();
    const { totpURI } = await twoFactorUser(t);
    for (let round = 0; round < 3; round++) {
      const challenge = await socialChallenge(t);
      for (let attempt = 0; attempt < CHALLENGE_ATTEMPT_LIMIT; attempt++) await verifyTotp(t, challenge, wrongCode(totpURI));
    }
    const challenge = await socialChallenge(t);

    const res = await verifyTotp(t, challenge, totpCode(totpURI));

    expect(await errorCode(res)).toBe(AuthErrorCode.TWO_FACTOR_LOCKED);
    expect(await t.isSignedIn(cookiesFrom(res, challenge))).toBe(false);
  });
});

describe('id-token sign-in', () => {
  it('answers a two-factor user with twoFactorRedirect and creates no session', async () => {
    const t = createGoogleStubbedAuth();
    await twoFactorUser(t);
    const sessionsBefore = t.db.session.length;

    const res = await idTokenSignIn(t);

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(await twoFactorRedirect(res)).toBe(true);
    expect(cookiesFrom(res)).toContain(CHALLENGE_COOKIE);
    expect(await t.isSignedIn(cookiesFrom(res))).toBe(false);
    expect(t.db.session).toHaveLength(sessionsBefore);
  });

  it('refuses a rejected id token for a two-factor user, with no session and no challenge', async () => {
    const t = createGoogleStubbedAuth({ idTokenAccepted: false });
    await twoFactorUser(t);
    const sessionsBefore = t.db.session.length;
    const verificationsBefore = t.db.verification.length;

    const res = await idTokenSignIn(t);

    expect(res.ok).toBe(false);
    expect(await twoFactorRedirect(res)).toBeUndefined();
    expect(cookiesFrom(res)).not.toContain(CHALLENGE_COOKIE);
    expect(await t.isSignedIn(cookiesFrom(res))).toBe(false);
    expect(t.db.session).toHaveLength(sessionsBefore);
    expect(t.db.verification).toHaveLength(verificationsBefore);
  });

  it('lets the challenge complete with an authenticator code', async () => {
    const t = createGoogleStubbedAuth();
    const { totpURI } = await twoFactorUser(t);
    const challenge = cookiesFrom(await idTokenSignIn(t));

    const res = await verifyTotp(t, challenge, totpCode(totpURI));

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(cookiesFrom(res, challenge))).toBe(true);
  });
});

describe('a user without two-factor', () => {
  async function member(t: TestAuth) {
    await signUpWithEmail(t.request, TEST_USER);
    markEmailsVerified(t);
  }

  it('is signed in directly on the provider callback', async () => {
    const t = createGoogleStubbedAuth();
    await member(t);

    const { callback, browser } = await providerRoundTrip(t);

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe(AppRoute.HOME);
    expect(cookiesFrom(callback)).not.toContain(CHALLENGE_COOKIE);
    expect(await t.isSignedIn(cookiesFrom(callback, browser))).toBe(true);
  });

  it('is signed in directly on the id-token sign-in', async () => {
    const t = createGoogleStubbedAuth();
    await member(t);

    const res = await idTokenSignIn(t);

    expect(res.status).toBe(200);
    expect(await twoFactorRedirect(res)).toBeUndefined();
    expect(cookiesFrom(res)).not.toContain(CHALLENGE_COOKIE);
    expect(await t.isSignedIn(cookiesFrom(res))).toBe(true);
  });

  it('is signed in directly when signing up through the provider', async () => {
    const t = createGoogleStubbedAuth();

    const { callback, browser } = await providerRoundTrip(t);

    expect(callback.headers.get('location')).toBe(AppRoute.HOME);
    expect(cookiesFrom(callback)).not.toContain(CHALLENGE_COOKIE);
    expect(await t.isSignedIn(cookiesFrom(callback, browser))).toBe(true);
  });
});

describe('linking a provider from settings', () => {
  it('keeps the two-factor user’s session and raises no challenge', async () => {
    const t = createGoogleStubbedAuth();
    const { cookie } = await twoFactorUser(t);
    const sessionsBefore = t.db.session.length;

    const { callback } = await providerRoundTrip(t, { cookie, path: '/link-social', callbackURL: AppRoute.SETTINGS_CONNECTED_ACCOUNTS });

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe(AppRoute.SETTINGS_CONNECTED_ACCOUNTS);
    expect(cookiesFrom(callback)).not.toContain(CHALLENGE_COOKIE);
    expect(t.db.account.map((account) => account.providerId).sort()).toEqual([CREDENTIAL_PROVIDER_ID, SocialProvider.GOOGLE]);
    expect(await t.isSignedIn(cookie)).toBe(true);
    expect(t.db.session).toHaveLength(sessionsBefore);
  });
});

describe('Replaced Session at a challenge', () => {
  it('ends the session this browser held and keeps the other device, on the provider callback', async () => {
    const t = createGoogleStubbedAuth();
    const { cookie: otherDevice, totpURI } = await twoFactorUser(t);
    const { challengeCookie: challenge } = await startTwoFactorSignIn(t.request, TEST_USER);
    const thisBrowser = cookiesFrom(await verifyTotp(t, challenge, totpCode(totpURI)));
    const sessionsBefore = t.db.session.length;

    const { callback } = await providerRoundTrip(t, { cookie: thisBrowser });

    expect(callback.headers.get('location')).toBe(AppRoute.LOGIN_TWO_FACTOR);
    expect(await t.isSignedIn(thisBrowser)).toBe(false);
    expect(await t.isSignedIn(otherDevice)).toBe(true);
    expect(t.db.session).toHaveLength(sessionsBefore - 1);
  });

  it('ends the session this browser held on the id-token sign-in', async () => {
    const t = createGoogleStubbedAuth();
    const { cookie } = await twoFactorUser(t);

    const res = await idTokenSignIn(t, cookie);

    expect(await twoFactorRedirect(res)).toBe(true);
    expect(await t.isSignedIn(cookie)).toBe(false);
  });
});

describe('an abandoned first sign-in through a provider', () => {
  it('leaves the provider linked and gives nobody a session', async () => {
    const t = createGoogleStubbedAuth();
    await twoFactorUser(t);
    const sessionsBefore = t.db.session.length;

    const browser = await socialChallenge(t);

    expect(t.db.account.map((account) => account.providerId).sort()).toEqual([CREDENTIAL_PROVIDER_ID, SocialProvider.GOOGLE]);
    expect(await t.isSignedIn(browser)).toBe(false);
    expect(t.db.session).toHaveLength(sessionsBefore);
  });

  it('challenges the next sign-in through the stray link too', async () => {
    const t = createGoogleStubbedAuth();
    await twoFactorUser(t);
    await socialChallenge(t);

    const { callback, browser } = await providerRoundTrip(t);

    expect(callback.headers.get('location')).toBe(AppRoute.LOGIN_TWO_FACTOR);
    expect(await t.isSignedIn(cookiesFrom(callback, browser))).toBe(false);
  });

  it('can be seen and unlinked from settings', async () => {
    const t = createGoogleStubbedAuth();
    const { cookie } = await twoFactorUser(t);
    await socialChallenge(t);
    const listed = (await (await t.request('/list-accounts', { cookie })).json()) as { id: string; providerId: string }[];
    const stray = listed.find((account) => account.providerId === SocialProvider.GOOGLE);
    expect(stray).toBeDefined();

    const unlink = await t.request(AuthEndpoint.UNLINK_ACCOUNT, { cookie, body: { accountId: stray?.id } });

    expect(unlink.status).toBe(200);
    expect(t.db.account.map((account) => account.providerId)).toEqual([CREDENTIAL_PROVIDER_ID]);
  });
});

describe('passkey sign-in for a two-factor user', () => {
  it('stays a complete sign-in with no challenge', async () => {
    const t = createGoogleStubbedAuth();
    await twoFactorUser(t);
    const authenticator = createPasskeyAuthenticator({ rpID: 'localhost', origin: TEST_ORIGIN });
    t.db.passkey.push({ ...authenticator.passkeyFor(t.db.user[0].id as string) });
    const options = await t.request('/passkey/generate-authenticate-options');
    const { challenge } = (await options.json()) as { challenge: string };

    const res = await t.request(AuthEndpoint.PASSKEY_VERIFY_AUTHENTICATION, {
      cookie: cookiesFrom(options),
      body: { response: authenticator.assert(challenge) },
    });

    expect(res.status).toBe(200);
    expect(cookiesFrom(res)).not.toContain(CHALLENGE_COOKIE);
    expect(await t.isSignedIn(cookiesFrom(res))).toBe(true);
  });
});
