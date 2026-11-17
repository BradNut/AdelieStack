import { AUTH_SESSION_FRESH_AGE } from '@adelie/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SendProps } from '#lib/server/api/mail/interfaces/mailer.interface';
import { type AuthRequest, ageSessions, signUpWithEmail, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

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

function storedLocale() {
  return db.user.find((u) => u.email === TEST_USER.email)?.locale;
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
