import { AUTH_SESSION_FRESH_AGE, AuthCallbackPath, AuthErrorCode } from '@adelie/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthEndpoint } from '#lib/server/api/auth/auth.endpoints';
import type { SendProps } from '#lib/server/api/mail/interfaces/mailer.interface';
import { EmailChangeRequestEmail } from '#lib/server/api/mail/templates/email-change-request.template';
import { type AuthRequest, ageSessions, cookiesFrom, signUpWithEmail, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const { email: EMAIL, password: PASSWORD } = TEST_USER;
const NEW_EMAIL = 'emperor@example.com';
const TAKEN_EMAIL = 'taken@example.com';
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

/** Signs up and forgets the sign-up's verification email, so a test only sees what the change sends. */
async function signUp(credentials = TEST_USER) {
  const { cookie } = await signUpWithEmail(request, credentials);
  sent.length = 0;
  return cookie;
}

const changeEmail = (cookie: string | undefined, newEmail = NEW_EMAIL) =>
  request(AuthEndpoint.CHANGE_EMAIL, { cookie, body: { newEmail, callbackURL: AuthCallbackPath.EMAIL_CHANGED } });

async function errorCode(res: Response) {
  return ((await res.json()) as { code: string }).code;
}

function currentEmail() {
  return db.user.find((u) => u.name === TEST_USER.name)?.email;
}

describe('starting an email change', () => {
  it('sends the confirmation to the new address from a fresh session', async () => {
    const cookie = await signUp();

    const res = await changeEmail(cookie);

    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toMatchObject({ email: NEW_EMAIL });
    expect(sent[0].template).toBeInstanceOf(EmailChangeRequestEmail);
    expect(currentEmail()).toBe(EMAIL);
  });

  it('still starts the change from a session just inside the fresh age', async () => {
    const cookie = await signUp();
    ageSessions(db, AUTH_SESSION_FRESH_AGE - 60);

    const res = await changeEmail(cookie);

    expect(res.status).toBe(200);
    expect(sent.map((mail) => mail.to)).toEqual([expect.objectContaining({ email: NEW_EMAIL })]);
  });

  it('refuses a session older than the fresh age with SESSION_NOT_FRESH and sends nothing', async () => {
    const cookie = await signUp();
    ageSessions(db, STALE_AGE);

    const res = await changeEmail(cookie);

    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe(AuthErrorCode.SESSION_NOT_FRESH);
    expect(sent).toHaveLength(0);
    expect(currentEmail()).toBe(EMAIL);
  });

  it('refuses a stale session the same way when the new address is already taken, so it reveals nothing', async () => {
    await signUp({ ...TEST_USER, name: 'Other', email: TAKEN_EMAIL });
    const cookie = await signUp();
    ageSessions(db, STALE_AGE);

    const res = await changeEmail(cookie, TAKEN_EMAIL);

    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe(AuthErrorCode.SESSION_NOT_FRESH);
    expect(sent).toHaveLength(0);
  });

  it('starts the change after a stale session signs in again', async () => {
    await signUp();
    ageSessions(db, STALE_AGE);
    const signedIn = await request(AuthEndpoint.SIGN_IN_EMAIL, { body: { email: EMAIL, password: PASSWORD } });
    expect(signedIn.status).toBe(200);

    const res = await changeEmail(cookiesFrom(signedIn));

    expect(res.status).toBe(200);
    expect(sent.map((mail) => mail.to)).toEqual([expect.objectContaining({ email: NEW_EMAIL })]);
  });

  it("answers a request without a session with Better Auth's own unauthenticated error", async () => {
    await signUp();

    const res = await changeEmail(undefined);

    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('UNAUTHORIZED');
    expect(sent).toHaveLength(0);
  });
});
