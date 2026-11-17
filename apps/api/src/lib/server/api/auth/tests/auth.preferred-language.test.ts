import { AUTH_SESSION_FRESH_AGE, RoleName, SocialProvider } from '@adelie/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SendProps } from '#lib/server/api/mail/interfaces/mailer.interface';
import { type AuthRequest, ageSessions, cookiesFrom, enrolPasskey, signUpWithEmail, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth, stubGoogleUserInfo } from '../../../../../test/auth-instance';

/** A session age just past the fresh age, so the session is stale. */
const STALE_AGE = AUTH_SESSION_FRESH_AGE + 60;

let db: ReturnType<typeof createTestAuth>['db'];
let request: AuthRequest;
let sent: SendProps[];

beforeEach(() => {
  ({
    db,
    request,
    mailer: { sent },
  } = createTestAuth());
});

/** Signs up and forgets the sign-up's verification email, so a test only sees what its own action sends. */
async function signUp() {
  const { cookie } = await signUpWithEmail(request, TEST_USER);
  sent.length = 0;
  return cookie;
}

function storedLocale(email = TEST_USER.email) {
  return db.user.find((u) => u.email === email)?.locale;
}

const saveLocale = (cookie: string, locale: unknown) => request('/update-user', { cookie, body: { locale } });

describe('saving a Preferred Language', () => {
  it('stores a supported locale from a stale session and sends no email', async () => {
    const cookie = await signUp();
    ageSessions(db, STALE_AGE);

    const res = await saveLocale(cookie, 'es');

    expect(res.status).toBe(200);
    expect(storedLocale()).toBe('es');
    expect(sent).toHaveLength(0);
  });

  it('clears it with null, so mail follows each request again', async () => {
    const cookie = await signUp();
    await saveLocale(cookie, 'de');

    const res = await saveLocale(cookie, null);

    expect(res.status).toBe(200);
    expect(storedLocale()).toBeNull();
  });

  it.each([
    ['an unsupported locale', 'fr'],
    ['a regional variant', 'de-AT'],
    ['a different casing', 'DE'],
    ['a non-string', 42],
  ])('rejects %s and keeps the stored value', async (_name, locale) => {
    const cookie = await signUp();
    await saveLocale(cookie, 'de');

    const res = await saveLocale(cookie, locale);

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('VALIDATION_ERROR');
    expect(storedLocale()).toBe('de');
  });
});

describe('seeding the Preferred Language at sign-up', () => {
  const GERMAN = { 'accept-language': 'de' };

  it('saves the Request Locale of a password sign-up', async () => {
    await request('/sign-up/email', { headers: GERMAN, body: TEST_USER });

    expect(storedLocale()).toBe('de');
  });

  it('saves en when the sign-up request names no supported language', async () => {
    await request('/sign-up/email', { headers: { 'accept-language': 'fr' }, body: TEST_USER });

    expect(storedLocale()).toBe('en');
  });

  it('ignores a locale in the sign-up body: the request decides', async () => {
    await request('/sign-up/email', { headers: GERMAN, body: { ...TEST_USER, locale: 'es' } });

    expect(storedLocale()).toBe('de');
  });

  it('saves the Request Locale of a social sign-up', async () => {
    const email = 'social@example.com';
    ({ db, request } = createTestAuth({
      socialProviders: {
        google: { clientId: 'id', clientSecret: 'secret', verifyIdToken: async () => true, getUserInfo: stubGoogleUserInfo(email) },
      },
    }));

    const res = await request('/sign-in/social', {
      headers: { 'accept-language': 'es' },
      body: { provider: SocialProvider.GOOGLE, idToken: { token: 'provider-token' } },
    });

    expect(res.status).toBe(200);
    expect(storedLocale(email)).toBe('es');
  });

  it("leaves an admin-created account without one, whatever the admin's language", async () => {
    const testAuth = createTestAuth();
    ({ db, request } = testAuth);
    const admin = { name: 'Admin', email: 'admin@example.com', password: TEST_USER.password };
    const { user } = await testAuth.auth.api.createUser({ body: { ...admin, role: RoleName.ADMIN } });
    await enrolPasskey(testAuth.auth, user.id);
    const cookie = cookiesFrom(await request('/sign-in/email', { body: { email: admin.email, password: admin.password } }));
    const invitee = 'invitee@example.com';

    const res = await request('/admin/create-user', {
      cookie,
      headers: GERMAN,
      body: { name: 'Invitee', email: invitee, password: TEST_USER.password, role: RoleName.USER, data: { locale: 'de' } },
    });

    expect(res.status).toBe(200);
    expect(storedLocale(invitee)).toBeNull();
    expect(storedLocale(admin.email)).toBeNull();
  });
});
