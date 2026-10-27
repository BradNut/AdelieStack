import { CAPTCHA_RESPONSE_HEADER, CaptchaProvider, CREDENTIAL_PROVIDER_ID, RoleName, SocialProvider } from '@adelie/shared';
import { totpCode } from '@adelie/test-utils/totp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cookiesFrom, signUpWithTotp } from '../../../../../test/auth-http';
import { createTestAuth, TEST_ORIGIN } from '../../../../../test/auth-instance';
import { createPasskeyAuthenticator } from '../../../../../test/passkey-authenticator';

const PASSWORD = 'Correct-horse-9';
const EMAIL = 'penguin@example.com';
const OTHER_EMAIL = 'puffin@example.com';

function build(overrides: Parameters<typeof createTestAuth>[0] = {}) {
  const testAuth = createTestAuth(overrides);
  const { request, db } = testAuth;
  const signUp = async (email = EMAIL, cookie?: string) =>
    request('/sign-up/email', { cookie, body: { name: 'Penguin', email, password: PASSWORD } });
  const signIn = (cookie?: string, email = EMAIL, password = PASSWORD) => request('/sign-in/email', { cookie, body: { email, password } });
  const isSignedIn = async (cookie: string) => (await (await request('/get-session', { cookie })).json()) !== null;
  /** The user's live session rows, one per browser that holds a session. */
  const sessionsOf = (email: string) => {
    const user = db.user.find((row) => row.email === email);
    return db.session.filter((row) => row.userId === user?.id);
  };
  return { ...testAuth, signUp, signIn, isSignedIn, sessionsOf };
}

/** The user signed in on two browsers: this one, holding `cookie`, and another device. */
async function signedInTwice(t: ReturnType<typeof build>, email = EMAIL) {
  const cookie = cookiesFrom(await t.signUp(email));
  const otherDevice = cookiesFrom(await t.signIn(undefined, email));
  return { cookie, otherDevice };
}

/** A session cookie whose signature no longer matches its token. */
function tamper(cookie: string) {
  return cookie.replace(/session_token=([^.;]+)\.[^;]+/, 'session_token=$1.forged-signature');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('email sign-in on a browser holding a session', () => {
  it('ends the Replaced Session, and the old cookie is rejected afterwards', async () => {
    const t = build();
    const { cookie, otherDevice } = await signedInTwice(t);

    const res = await t.signIn(cookie);

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(cookie)).toBe(false);
    expect(await t.isSignedIn(cookiesFrom(res, cookie))).toBe(true);
    expect(await t.isSignedIn(otherDevice)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(2);
  });

  it('ends the Replaced Session when a different user signs in', async () => {
    const t = build();
    await t.signUp(OTHER_EMAIL);
    const { cookie, otherDevice } = await signedInTwice(t);

    const res = await t.signIn(cookie, OTHER_EMAIL);

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(cookie)).toBe(false);
    expect(await t.isSignedIn(otherDevice)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(1);
  });
});

describe('email sign-up on a browser holding a session', () => {
  it('ends the Replaced Session and keeps the old account’s other devices', async () => {
    const t = build();
    const { cookie, otherDevice } = await signedInTwice(t);

    const res = await t.signUp(OTHER_EMAIL, cookie);

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(cookie)).toBe(false);
    expect(await t.isSignedIn(cookiesFrom(res, cookie))).toBe(true);
    expect(await t.isSignedIn(otherDevice)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(1);
  });
});

describe('password step of a two-factor account', () => {
  const user = { name: 'Penguin', email: EMAIL, password: PASSWORD };

  /** A two-factor user signed in on two browsers: this one, holding `cookie`, and another device. */
  async function twoFactorSignedInTwice(t: ReturnType<typeof build>) {
    const { totpURI, cookie: otherDevice } = await signUpWithTotp(t.request, user);
    const challenge = await t.signIn();
    const verified = await t.request('/two-factor/verify-totp', { cookie: cookiesFrom(challenge), body: { code: totpCode(totpURI) } });
    return { totpURI, cookie: cookiesFrom(verified), otherDevice };
  }

  it('ends the Replaced Session as soon as the password is accepted, so abandoning the challenge leaves none', async () => {
    const t = build();
    const { cookie, otherDevice } = await twoFactorSignedInTwice(t);

    const res = await t.signIn(cookie);

    expect(((await res.json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(true);
    expect(await t.isSignedIn(cookie)).toBe(false);
    expect(await t.isSignedIn(otherDevice)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(1);
  });

  it('leaves exactly one session for this browser once the challenge is completed', async () => {
    const t = build();
    const { totpURI, cookie, otherDevice } = await twoFactorSignedInTwice(t);
    const challengeCookie = cookiesFrom(await t.signIn(cookie), cookie);

    const res = await t.request('/two-factor/verify-totp', { cookie: challengeCookie, body: { code: totpCode(totpURI) } });

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(cookiesFrom(res, challengeCookie))).toBe(true);
    expect(await t.isSignedIn(otherDevice)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(2);
  });
});

describe('passkey sign-in on a browser holding a session', () => {
  async function withPasskey(t: ReturnType<typeof build>) {
    const { cookie, otherDevice } = await signedInTwice(t);
    const authenticator = createPasskeyAuthenticator({ rpID: 'localhost', origin: TEST_ORIGIN });
    const [user] = t.db.user;
    t.db.passkey.push({ ...authenticator.passkeyFor(user.id as string) });
    /** Signs in with the passkey from a browser holding `browserCookie`; a forged signature fails the assertion. */
    const passkeySignIn = async (browserCookie?: string, { forged = false } = {}) => {
      const options = await t.request('/passkey/generate-authenticate-options', { cookie: browserCookie });
      const { challenge } = (await options.json()) as { challenge: string };
      const response = authenticator.assert(challenge);
      if (forged) response.response.signature = response.response.authenticatorData;
      return t.request('/passkey/verify-authentication', { cookie: cookiesFrom(options, browserCookie), body: { response } });
    };
    return { cookie, otherDevice, passkeySignIn };
  }

  it('signs in with a valid assertion on a browser with no session', async () => {
    const t = build();
    const { passkeySignIn } = await withPasskey(t);

    const res = await passkeySignIn();

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(cookiesFrom(res))).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(3);
  });

  it('ends the Replaced Session and keeps the other device', async () => {
    const t = build();
    const { cookie, otherDevice, passkeySignIn } = await withPasskey(t);

    const res = await passkeySignIn(cookie);

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(cookie)).toBe(false);
    expect(await t.isSignedIn(cookiesFrom(res, cookie))).toBe(true);
    expect(await t.isSignedIn(otherDevice)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(2);
  });

  it('ends nothing when the assertion fails', async () => {
    const t = build();
    const { cookie, passkeySignIn } = await withPasskey(t);

    const res = await passkeySignIn(cookie, { forged: true });

    expect(res.ok).toBe(false);
    expect(await t.isSignedIn(cookie)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(2);
  });
});

describe('passkey registration on a browser holding a session', () => {
  /** Registers a new passkey from the signed-in browser, asking for a session with it when `createSession` is set. */
  async function registerPasskey(t: ReturnType<typeof build>, cookie: string, createSession: boolean) {
    const authenticator = createPasskeyAuthenticator({ rpID: 'localhost', origin: TEST_ORIGIN });
    const options = await t.request('/passkey/generate-register-options', { cookie });
    const { challenge } = (await options.json()) as { challenge: string };
    const response = authenticator.register(challenge);
    return t.request('/passkey/verify-registration', { cookie: cookiesFrom(options, cookie), body: { response, createSession } });
  }

  it('ends the Replaced Session when registration also creates a session', async () => {
    const t = build();
    const { cookie, otherDevice } = await signedInTwice(t);

    const res = await registerPasskey(t, cookie, true);

    expect(res.status).toBe(200);
    expect(t.db.passkey).toHaveLength(1);
    expect(await t.isSignedIn(cookie)).toBe(false);
    expect(await t.isSignedIn(cookiesFrom(res, cookie))).toBe(true);
    expect(await t.isSignedIn(otherDevice)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(2);
  });

  it('keeps the current session when registration only adds the passkey', async () => {
    const t = build();
    const { cookie } = await signedInTwice(t);

    const res = await registerPasskey(t, cookie, false);

    expect(res.status).toBe(200);
    expect(t.db.passkey).toHaveLength(1);
    expect(await t.isSignedIn(cookie)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(2);
  });
});

describe('social sign-in on a browser holding a session', () => {
  const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

  /** Google answered locally: the profile is EMAIL, verified; a code exchange succeeds unless `codeAccepted` is false. */
  function buildSocial({ codeAccepted = true } = {}) {
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
    return build({
      signUpEnabled: false,
      socialProviders: {
        google: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          verifyIdToken: async () => true,
          // Each provider types its user info and raw profile differently; Better Auth only passes them through.
          getUserInfo: async () =>
            ({ user: { id: 'google-sub-1', email: EMAIL, emailVerified: true, name: 'Penguin' }, data: { sub: 'google-sub-1' } }) as never,
        },
      },
    });
  }

  async function verifiedSignedInTwice(t: ReturnType<typeof build>) {
    const { user } = await t.auth.api.createUser({ body: { name: 'Penguin', email: EMAIL, password: PASSWORD, role: RoleName.USER } });
    await (await t.auth.$context).internalAdapter.updateUser(user.id, { emailVerified: true });
    return { cookie: cookiesFrom(await t.signIn()), otherDevice: cookiesFrom(await t.signIn()) };
  }

  /** Starts the provider redirect (sign-in, or linking from settings with `path: '/link-social'`) and comes back with `code`. */
  async function roundTrip(t: ReturnType<typeof build>, cookie: string, path = '/sign-in/social') {
    const start = await t.request(path, { cookie, body: { provider: SocialProvider.GOOGLE, callbackURL: `${TEST_ORIGIN}/account` } });
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get('state') ?? '';
    const browser = cookiesFrom(start, cookie);
    const callback = await t.request(`/callback/google?code=provider-code&state=${encodeURIComponent(state)}`, { cookie: browser });
    return { callback, browser };
  }

  it('ends the Replaced Session when an id-token sign-in creates a session', async () => {
    const t = buildSocial();
    const { cookie, otherDevice } = await verifiedSignedInTwice(t);

    const res = await t.request('/sign-in/social', { cookie, body: { provider: SocialProvider.GOOGLE, idToken: { token: 'provider-token' } } });

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(cookie)).toBe(false);
    expect(await t.isSignedIn(cookiesFrom(res, cookie))).toBe(true);
    expect(await t.isSignedIn(otherDevice)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(2);
  });

  it('ends the Replaced Session when the provider callback creates a session', async () => {
    const t = buildSocial();
    const { cookie, otherDevice } = await verifiedSignedInTwice(t);

    const { callback, browser } = await roundTrip(t, cookie);

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe(`${TEST_ORIGIN}/account`);
    expect(await t.isSignedIn(cookie)).toBe(false);
    expect(await t.isSignedIn(cookiesFrom(callback, browser))).toBe(true);
    expect(await t.isSignedIn(otherDevice)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(2);
  });

  it('keeps the current session when the callback links a provider from settings', async () => {
    const t = buildSocial();
    const { cookie, otherDevice } = await verifiedSignedInTwice(t);

    const { callback } = await roundTrip(t, cookie, '/link-social');

    expect(callback.status).toBe(302);
    expect(t.db.account.map((account) => account.providerId).sort()).toEqual([CREDENTIAL_PROVIDER_ID, SocialProvider.GOOGLE]);
    expect(await t.isSignedIn(cookie)).toBe(true);
    expect(await t.isSignedIn(otherDevice)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(2);
  });

  it('ends nothing when the provider rejects the code', async () => {
    const t = buildSocial({ codeAccepted: false });
    const { cookie } = await verifiedSignedInTwice(t);

    const { callback } = await roundTrip(t, cookie);

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toContain('error=');
    expect(await t.isSignedIn(cookie)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(2);
  });

  it('ends nothing when an id-token sign-in is refused', async () => {
    const t = buildSocial();
    const { cookie } = await verifiedSignedInTwice(t);
    for (const user of t.db.user) user.emailVerified = false;

    const res = await t.request('/sign-in/social', { cookie, body: { provider: SocialProvider.GOOGLE, idToken: { token: 'provider-token' } } });

    expect(res.ok).toBe(false);
    expect(await t.isSignedIn(cookie)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(2);
  });
});

describe('a failed sign-in ends nothing', () => {
  it('keeps the session after a wrong password', async () => {
    const t = build();
    const { cookie } = await signedInTwice(t);

    const res = await t.signIn(cookie, EMAIL, 'Wrong-horse-9');

    expect(res.status).toBe(401);
    expect(await t.isSignedIn(cookie)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(2);
  });

  it('keeps the session after a failed captcha', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ success: true })),
    );
    const t = build({ captcha: { provider: CaptchaProvider.TURNSTILE, secretKey: 'secret', siteKey: 'site' } });
    const signUp = await t.request('/sign-up/email', {
      body: { name: 'Penguin', email: EMAIL, password: PASSWORD },
      headers: { [CAPTCHA_RESPONSE_HEADER]: 'token' },
    });
    const cookie = cookiesFrom(signUp);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ success: false })),
    );

    const res = await t.request('/sign-in/email', {
      cookie,
      body: { email: EMAIL, password: PASSWORD },
      headers: { [CAPTCHA_RESPONSE_HEADER]: 'token' },
    });

    expect(res.ok).toBe(false);
    expect(await t.isSignedIn(cookie)).toBe(true);
  });

  it('keeps the session when the account is banned', async () => {
    const t = build();
    await t.signUp(OTHER_EMAIL);
    const { cookie } = await signedInTwice(t);
    const banned = t.db.user.find((row) => row.email === OTHER_EMAIL);
    if (banned) banned.banned = true;

    const res = await t.signIn(cookie, OTHER_EMAIL);

    expect(res.ok).toBe(false);
    expect(await t.isSignedIn(cookie)).toBe(true);
  });

  it('keeps the session when sign-up is refused for a taken email', async () => {
    const t = build();
    const { cookie } = await signedInTwice(t);

    const res = await t.signUp(EMAIL, cookie);

    expect(res.ok).toBe(false);
    expect(await t.isSignedIn(cookie)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(2);
  });
});

describe('nothing to end', () => {
  it('signs in as before on a browser with no session cookie', async () => {
    const t = build();
    const { otherDevice } = await signedInTwice(t);

    const res = await t.signIn();

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(otherDevice)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(3);
  });

  it('signs in and ends nothing when the session cookie is badly signed', async () => {
    const t = build();
    const { cookie } = await signedInTwice(t);

    const res = await t.signIn(tamper(cookie));

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(cookie)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(3);
  });

  it('signs in when the Replaced Session has already expired', async () => {
    const t = build();
    const { cookie, otherDevice } = await signedInTwice(t);
    const [expired] = t.sessionsOf(EMAIL);
    expired.expiresAt = new Date(Date.now() - 1000);

    const res = await t.signIn(cookie);

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(otherDevice)).toBe(true);
  });

  it('signs in when the Replaced Session was already ended elsewhere', async () => {
    const t = build();
    const { cookie, otherDevice } = await signedInTwice(t);
    await t.request('/revoke-other-sessions', { cookie: otherDevice, body: {} });

    const res = await t.signIn(cookie);

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(otherDevice)).toBe(true);
    expect(t.sessionsOf(EMAIL)).toHaveLength(2);
  });
});

describe('ending the Replaced Session is best-effort', () => {
  it('logs a failure and still signs in', async () => {
    const t = build();
    const { cookie } = await signedInTwice(t);
    const { internalAdapter, logger } = await t.auth.$context;
    vi.spyOn(internalAdapter, 'deleteSession').mockRejectedValueOnce(new Error('database unavailable'));
    const logError = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const res = await t.signIn(cookie);

    expect(res.status).toBe(200);
    expect(await t.isSignedIn(cookiesFrom(res, cookie))).toBe(true);
    expect(logError).toHaveBeenCalledWith('Could not end the Replaced Session', expect.any(Error));
  });
});
