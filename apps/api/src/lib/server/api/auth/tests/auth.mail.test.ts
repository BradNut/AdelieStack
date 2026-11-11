import { createHmac } from 'node:crypto';
import { AUTH_BASE_PATH, SECONDS_PER_MINUTE } from '@adelie/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthEndpoint } from '#lib/server/api/auth/auth.endpoints';
import { AUTH_LINK_EMAIL_FAILED_LOG, SECURITY_EVENT_EMAIL_FAILED_LOG } from '#lib/server/api/auth/auth.mail';
import { CHANGE_EMAIL_REQUEST_TYPE } from '#lib/server/api/auth/auth.verification-token';
import type { EmailTemplate } from '#lib/server/api/mail/interfaces/email-template.interface';
import type { SendProps } from '#lib/server/api/mail/interfaces/mailer.interface';
import { EmailChangeNoticeEmail } from '#lib/server/api/mail/templates/email-change-notice.template';
import { EmailChangeRequestEmail } from '#lib/server/api/mail/templates/email-change-request.template';
import { EmailVerificationEmail } from '#lib/server/api/mail/templates/email-verification.template';
import { PasswordChangedEmail } from '#lib/server/api/mail/templates/password-changed.template';
import { PasswordResetLinkEmail } from '#lib/server/api/mail/templates/password-reset-link.template';
import { RecoveryCodesRegeneratedEmail } from '#lib/server/api/mail/templates/recovery-codes-regenerated.template';
import { RecoveryCodesUsedEmail } from '#lib/server/api/mail/templates/recovery-codes-used.template';
import {
  type AuthRequest,
  cookiesFrom,
  emailedLink,
  signUpWithEmail,
  signUpWithTotp,
  startTwoFactorSignIn,
  TEST_USER,
} from '../../../../../test/auth-http';
import { createTestAuth, TEST_ORIGIN } from '../../../../../test/auth-instance';
import type { MailerServiceMock } from '../../../../../test/mocks/mailer.mock';

const { email: EMAIL, password: PASSWORD } = TEST_USER;
const NEW_PASSWORD = 'Another-pass-phrase-7';
const UNKNOWN_EMAIL = 'nobody@example.com';
const RESET_REDIRECT = `${TEST_ORIGIN}/reset`;
const NEW_EMAIL = 'emperor@example.com';

let auth: ReturnType<typeof createTestAuth>['auth'];
let request: AuthRequest;
let sent: SendProps[];
let mailerSend: MailerServiceMock['send'];
const mailLog = { error: vi.fn() };

/** Forgets the mail sent so far, so a test only sees what its action sends. */
function clearSent() {
  sent.length = 0;
}

function sentTemplates() {
  return sent.map((data) => data.template);
}

/** The path of the first link in an email, ready for `request`. */
function linkPath(mail: SendProps | undefined) {
  return emailedLink(mail).replace(TEST_ORIGIN, '').replace(AUTH_BASE_PATH, '');
}

async function signUp() {
  const { cookie } = await signUpWithEmail(request, TEST_USER);
  clearSent();
  return cookie;
}

async function userIdOf(cookie: string) {
  const session = (await (await request('/get-session', { cookie })).json()) as { user: { id: string } };
  return session.user.id;
}

beforeEach(() => {
  const testAuth = createTestAuth();
  auth = testAuth.auth;
  request = testAuth.request;
  sent = testAuth.mailer.sent;
});

/** For a `describe` that reads the mail log: gives each of its tests an instance that writes to `mailLog`. */
function useMailLog() {
  beforeEach(() => {
    mailLog.error.mockReset();
    const testAuth = createTestAuth({ mailLog });
    auth = testAuth.auth;
    request = testAuth.request;
    sent = testAuth.mailer.sent;
    mailerSend = testAuth.mailer.send;
  });
}

/** Waits a macrotask, which lets every send a request detached settle. */
async function detachedSendsSettled() {
  await new Promise(setImmediate);
}

describe('verification email', () => {
  it('is sent to the new user on sign-up', async () => {
    await signUpWithEmail(request, TEST_USER);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toMatchObject({ email: EMAIL });
    expect(sent[0].template).toBeInstanceOf(EmailVerificationEmail);
    expect(sent[0].template.html()).toContain(`${AUTH_BASE_PATH}/verify-email?token=`);
  });
});

describe('password reset', () => {
  it('emails a reset link to a known user', async () => {
    await signUp();

    await request('/request-password-reset', { body: { email: EMAIL, redirectTo: RESET_REDIRECT } });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toMatchObject({ email: EMAIL });
    expect(sent[0].template).toBeInstanceOf(PasswordResetLinkEmail);
  });

  it('sends nothing for an unknown address', async () => {
    await request('/request-password-reset', { body: { email: UNKNOWN_EMAIL, redirectTo: RESET_REDIRECT } });

    expect(sent).toHaveLength(0);
  });

  it('sends one password-changed email once the reset completes', async () => {
    await signUp();
    await request('/request-password-reset', { body: { email: EMAIL, redirectTo: RESET_REDIRECT } });
    const link = emailedLink(sent[0]);
    const token = new URL(link).pathname.split('/').pop();
    clearSent();

    const res = await request('/reset-password', { body: { newPassword: NEW_PASSWORD, token } });

    expect(res.ok).toBe(true);
    expect(sentTemplates()).toHaveLength(1);
    expect(sentTemplates()[0]).toBeInstanceOf(PasswordChangedEmail);
    expect(sent[0].to).toMatchObject({ email: EMAIL });
  });
});

describe('security-event emails', () => {
  it('sends one email when the password is changed', async () => {
    const cookie = await signUp();

    const res = await request('/change-password', { cookie, body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD } });

    expect(res.ok).toBe(true);
    expect(sentTemplates()).toHaveLength(1);
    expect(sentTemplates()[0]).toBeInstanceOf(PasswordChangedEmail);
    expect(sent[0].to).toMatchObject({ email: EMAIL });
  });

  it('sends nothing when the current password is wrong', async () => {
    const cookie = await signUp();

    const res = await request('/change-password', { cookie, body: { currentPassword: 'wrong-password-123', newPassword: NEW_PASSWORD } });

    expect(res.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('sends one email when recovery codes are regenerated', async () => {
    const { cookie } = await signUpWithTotp(request, TEST_USER);
    clearSent();

    const res = await request('/two-factor/generate-backup-codes', { cookie, body: { password: PASSWORD } });

    expect(res.ok).toBe(true);
    expect(sentTemplates()).toHaveLength(1);
    expect(sentTemplates()[0]).toBeInstanceOf(RecoveryCodesRegeneratedEmail);
  });

  it('sends nothing when regeneration is refused', async () => {
    const { cookie } = await signUpWithTotp(request, TEST_USER);
    clearSent();

    const res = await request('/two-factor/generate-backup-codes', { cookie, body: { password: 'wrong-password-123' } });

    expect(res.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('sends one email when a recovery code is used, and none for an invalid code', async () => {
    const {
      backupCodes: [code],
    } = await signUpWithTotp(request, TEST_USER);
    // Recovery codes are a sign-in step: the password sign-in leaves a two-factor challenge cookie.
    const { challengeCookie: cookie } = await startTwoFactorSignIn(request, TEST_USER);
    clearSent();

    const bad = await request('/two-factor/verify-backup-code', { cookie, body: { code: 'not-a-real-code' } });
    expect(bad.ok).toBe(false);
    expect(sent).toHaveLength(0);

    const res = await request('/two-factor/verify-backup-code', { cookie, body: { code } });
    expect(res.ok).toBe(true);
    expect(sentTemplates()).toHaveLength(1);
    expect(sentTemplates()[0]).toBeInstanceOf(RecoveryCodesUsedEmail);
  });
});

describe('the language of an email', () => {
  const ENGLISH_SUBJECT = 'Your password was changed';

  async function changePasswordWith(headers: Record<string, string>) {
    const cookie = await signUp();
    await request('/change-password', { cookie, headers, body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD } });
    return sent[0].template;
  }

  it('follows Accept-Language', async () => {
    const email = await changePasswordWith({ 'accept-language': 'de' });

    expect(email.html()).toContain("<html lang='de'>");
    expect(email.subject()).not.toBe(ENGLISH_SUBJECT);
  });

  it('uses the base language of a regional variant', async () => {
    const email = await changePasswordWith({ 'accept-language': 'de-AT' });

    expect(email.html()).toContain("<html lang='de'>");
    expect(email.subject()).not.toBe(ENGLISH_SUBJECT);
  });

  it.each([
    ['no language', {}],
    ['only unsupported languages', { 'accept-language': 'fr, ja;q=0.8' }],
  ])('is English when the request names %s', async (_name, headers: Record<string, string>) => {
    const email = await changePasswordWith(headers);

    expect(email.html()).toContain("<html lang='en'>");
    expect(email.subject()).toBe(ENGLISH_SUBJECT);
  });
});

describe('every email follows the language of the request that caused it', () => {
  const GERMAN = { 'accept-language': 'de' };

  function expectGerman(templateClass: new (...args: never[]) => EmailTemplate) {
    const email = sentTemplates().find((template) => template instanceof templateClass);
    expect(email?.html()).toContain("<html lang='de'>");
  }

  it('the verification email', async () => {
    await signUp();

    await request('/send-verification-email', { headers: GERMAN, body: { email: EMAIL } });

    expectGerman(EmailVerificationEmail);
  });

  it('the password reset link', async () => {
    await signUp();

    await request('/request-password-reset', { headers: GERMAN, body: { email: EMAIL, redirectTo: RESET_REDIRECT } });

    expectGerman(PasswordResetLinkEmail);
  });

  it('the email change request and notice', async () => {
    const cookie = await signUp();

    await request('/change-email', { cookie, headers: GERMAN, body: { newEmail: NEW_EMAIL, callbackURL: '/email-verified' } });
    expectGerman(EmailChangeRequestEmail);

    await request(linkPath(sent.at(-1)), { cookie, headers: GERMAN });
    expectGerman(EmailChangeNoticeEmail);
  });

  it('the recovery code emails', async () => {
    const {
      cookie,
      backupCodes: [code],
    } = await signUpWithTotp(request, TEST_USER);
    clearSent();

    const { challengeCookie } = await startTwoFactorSignIn(request, TEST_USER);
    await request('/two-factor/verify-backup-code', { cookie: challengeCookie, headers: GERMAN, body: { code } });
    expectGerman(RecoveryCodesUsedEmail);

    await request('/two-factor/generate-backup-codes', { cookie, headers: GERMAN, body: { password: PASSWORD } });
    expectGerman(RecoveryCodesRegeneratedEmail);
  });
});

describe('the two-factor code email', () => {
  it('follows the language of the request that asked for the code', async () => {
    await signUpWithTotp(request, TEST_USER);
    const { challengeCookie: cookie } = await startTwoFactorSignIn(request, TEST_USER);
    clearSent();

    await request('/two-factor/send-otp', { cookie, headers: { 'accept-language': 'es' }, body: {} });

    expect(sent[0].template.html()).toContain("<html lang='es'>");
    expect(sent[0].template.subject()).not.toBe('Your sign-in code');
  });
});

describe('email change', () => {
  /** How long an emailed link lasts: Better Auth's default, as `emailVerification.expiresIn` is not set. */
  const LINK_LIFETIME_SECONDS = 60 * SECONDS_PER_MINUTE;

  /** Follows the first link of the last email sent, the way a click in the mail client would. */
  async function followLastLink(cookie: string) {
    return request(linkPath(sent.at(-1)), { cookie });
  }

  async function currentEmail(cookie: string) {
    const session = (await (await request('/get-session', { cookie })).json()) as { user: { email: string } };
    return session.user.email;
  }

  it('sends the confirmation link to the new address only', async () => {
    const cookie = await signUp();

    const res = await request('/change-email', { cookie, body: { newEmail: NEW_EMAIL, callbackURL: '/email-verified' } });

    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toMatchObject({ email: NEW_EMAIL });
    expect(sent[0].template).toBeInstanceOf(EmailChangeRequestEmail);
    expect(await currentEmail(cookie)).toBe(EMAIL);
  });

  it('changes the email and notifies the old address once the link is followed', async () => {
    const cookie = await signUp();
    await request('/change-email', { cookie, body: { newEmail: NEW_EMAIL, callbackURL: '/email-verified' } });

    await followLastLink(cookie);

    expect(await currentEmail(cookie)).toBe(NEW_EMAIL);
    expect(sent).toHaveLength(2);
    expect(sent[1].to).toMatchObject({ email: EMAIL });
    expect(sent[1].template).toBeInstanceOf(EmailChangeNoticeEmail);
    expect(sent[1].template.html()).toContain(NEW_EMAIL);
  });

  /** Asks for the change and returns the path of the link emailed to the new address, ready for `request`. */
  async function requestChangeLink(cookie: string, callbackURL?: string) {
    await request('/change-email', { cookie, body: { newEmail: NEW_EMAIL, callbackURL } });
    return linkPath(sent.at(-1));
  }

  function notices() {
    return sentTemplates().filter((t) => t instanceof EmailChangeNoticeEmail);
  }

  function expectOneNoticeToOldAddress() {
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toMatchObject({ email: EMAIL });
    expect(sent[0].template).toBeInstanceOf(EmailChangeNoticeEmail);
  }

  function genuineToken(link: string) {
    return new URLSearchParams(link.split('?')[1]).get('token') ?? '';
  }

  /** Holds address updates until `clicks` of them have arrived, so every click has passed the token check and the lookup. */
  async function holdUpdatesUntil(clicks: number) {
    const { internalAdapter } = await auth.$context;
    const update = internalAdapter.updateUserByEmail;
    let release = () => {};
    const allArrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived = 0;
    vi.spyOn(internalAdapter, 'updateUserByEmail').mockImplementation(async (email, data) => {
      arrived += 1;
      if (arrived === clicks) release();
      await allArrived;
      return update(email, data);
    });
  }

  it('sends the notice only once if the link is followed again', async () => {
    const cookie = await signUp();
    const link = await requestChangeLink(cookie, '/email-verified');

    await request(link, { cookie });
    await request(link, { cookie });

    expect(notices()).toHaveLength(1);
  });

  describe('a genuine link', () => {
    /** The later click's update finds no row under the old address, so Better Auth hands the hook no user. */
    it('notifies the old address once and fails neither of two concurrent clicks', async () => {
      const cookie = await signUp();
      const link = await requestChangeLink(cookie, '/email-verified');
      await holdUpdatesUntil(2);
      clearSent();

      const responses = await Promise.all([request(link), request(link)]);

      expect(responses.map((res) => res.status)).toEqual([302, 302]);
      expect(await currentEmail(cookie)).toBe(NEW_EMAIL);
      expectOneNoticeToOldAddress();
    });

    it('sends no notice and does not throw when run server-side without a request', async () => {
      const cookie = await signUp();
      const link = await requestChangeLink(cookie);
      clearSent();

      await auth.api.verifyEmail({ query: { token: genuineToken(link) } });

      expect(sent).toHaveLength(0);
      expect(await currentEmail(cookie)).toBe(NEW_EMAIL);
    });

    it('notifies the old address once when it ends in a redirect', async () => {
      const cookie = await signUp();
      const link = await requestChangeLink(cookie, '/email-verified');
      clearSent();

      const res = await request(link, { cookie });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/email-verified');
      expectOneNoticeToOldAddress();
    });

    it('notifies the old address once when it answers without a redirect', async () => {
      const cookie = await signUp();
      const link = await requestChangeLink(cookie);
      clearSent();

      const res = await request(link.replace(/&callbackURL=.*$/, ''), { cookie });

      expect(res.status).toBe(200);
      expectOneNoticeToOldAddress();
    });

    it('notifies the old address when followed signed out', async () => {
      const cookie = await signUp();
      const link = await requestChangeLink(cookie, '/email-verified');
      clearSent();

      const res = await request(link);

      expect(res.status).toBe(302);
      expectOneNoticeToOldAddress();
    });

    it('sends nothing when followed by a different signed-in account', async () => {
      const cookie = await signUp();
      const link = await requestChangeLink(cookie);
      const { cookie: otherCookie } = await signUpWithEmail(request, { ...TEST_USER, email: 'other@example.com' });
      clearSent();

      await request(link, { cookie: otherCookie });

      expect(sent).toHaveLength(0);
      expect(await currentEmail(cookie)).toBe(EMAIL);
    });

    it('sends no notice for a plain verification link', async () => {
      await signUpWithEmail(request, TEST_USER);
      const link = linkPath(sent.at(-1));
      clearSent();

      const res = await request(link);

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/');
      expect(sent).toHaveLength(0);
    });
  });

  describe('an expired link', () => {
    const PAST_EXPIRY_MS = (LINK_LIFETIME_SECONDS + 1) * 1000;
    const EXPIRED_REDIRECT = '/?error=TOKEN_EXPIRED';

    function passExpiry() {
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + PAST_EXPIRY_MS });
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it('sends nothing and leaves the address alone', async () => {
      const cookie = await signUp();
      const link = await requestChangeLink(cookie);
      clearSent();
      passExpiry();

      const res = await request(link);

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(EXPIRED_REDIRECT);
      expect(sent).toHaveLength(0);
      expect(await currentEmail(cookie)).toBe(EMAIL);
    });

    it('sends no second notice for a link that was already accepted', async () => {
      const cookie = await signUp();
      const link = await requestChangeLink(cookie);
      await request(link, { cookie });
      clearSent();
      passExpiry();

      const res = await request(link);

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(EXPIRED_REDIRECT);
      expect(sent).toHaveLength(0);
    });
  });

  describe('a link whose signature does not verify', () => {
    const ATTACKER_EMAIL = 'attacker@example.com';
    const WRONG_KEY = 'a-key-the-server-has-never-seen-before';
    /** Rejected for its signature, so the same answer is due whichever address it names. */
    const REJECTED = { status: 401, code: 'INVALID_TOKEN' };

    function base64url(value: object) {
      return Buffer.from(JSON.stringify(value)).toString('base64url');
    }

    function hs256(body: string, key: string) {
      return createHmac('sha256', key).update(body).digest('base64url');
    }

    function wrongKeyToken(claims: object) {
      const body = `${base64url({ alg: 'HS256' })}.${base64url(claims)}`;
      return `${body}.${hs256(body, WRONG_KEY)}`;
    }

    function unsignedToken(claims: object) {
      return `${base64url({ alg: 'none' })}.${base64url(claims)}.`;
    }

    /** Exactly what the notice used to go out on: an old address (by default a vacant one), and a new one that may have an account. */
    function changeClaims(updateTo: string, email = ATTACKER_EMAIL) {
      return { email, updateTo, requestType: CHANGE_EMAIL_REQUEST_TYPE, exp: Math.floor(Date.now() / 1000) + LINK_LIFETIME_SECONDS };
    }

    describe.each([
      ['signed with the wrong key', wrongKeyToken],
      ['carrying no signature', unsignedToken],
    ])('%s', (_name, forge) => {
      describe.each([
        ['new address (`updateTo`)', (address: string) => changeClaims(address)],
        ['old address (`email`, the notice recipient and lookup key)', (address: string) => changeClaims(NEW_EMAIL, address)],
      ])('with its %s claim varied', (_claim, claims) => {
        it('answers the same and sends nothing, whether it names a registered or an unregistered address', async () => {
          await signUp();

          const registered = await request(`${AuthEndpoint.VERIFY_EMAIL}?token=${forge(claims(EMAIL))}`);
          const unregistered = await request(`${AuthEndpoint.VERIFY_EMAIL}?token=${forge(claims(UNKNOWN_EMAIL))}`);

          expect(registered.status).toBe(REJECTED.status);
          expect(unregistered.status).toBe(REJECTED.status);
          const registeredBody = await registered.json();
          expect(registeredBody).toMatchObject({ code: REJECTED.code });
          expect(await unregistered.json()).toEqual(registeredBody);
          expect(sent).toHaveLength(0);
        });

        it('redirects the same and sends nothing when it carries a callback', async () => {
          await signUp();
          const path = (address: string) => `${AuthEndpoint.VERIFY_EMAIL}?token=${forge(claims(address))}&callbackURL=/email-verified`;

          const registered = await request(path(EMAIL));
          const unregistered = await request(path(UNKNOWN_EMAIL));

          expect(registered.status).toBe(302);
          expect(registered.headers.get('location')).toBe(`/email-verified?error=${REJECTED.code}`);
          expect(unregistered.status).toBe(302);
          expect(unregistered.headers.get('location')).toBe(registered.headers.get('location'));
          expect(sent).toHaveLength(0);
        });
      });
    });

    it.each([
      ['a registered new address', EMAIL, ATTACKER_EMAIL],
      ['a registered old address', NEW_EMAIL, EMAIL],
    ])('sends nothing when the claims of a genuine link are swapped for %s', async (_name, updateTo, email) => {
      const cookie = await signUp();
      const link = await requestChangeLink(cookie);
      const [header, , signature] = genuineToken(link).split('.');
      clearSent();

      const res = await request(`${AuthEndpoint.VERIFY_EMAIL}?token=${header}.${base64url(changeClaims(updateTo, email))}.${signature}`);

      expect(res.status).toBe(REJECTED.status);
      expect(sent).toHaveLength(0);
      expect(await currentEmail(cookie)).toBe(EMAIL);
    });

    it.each([
      ['first', (genuine: string, forged: string) => `token=${forged}&token=${genuine}`],
      ['last', (genuine: string, forged: string) => `token=${genuine}&token=${forged}`],
    ])('sends nothing when a forged token comes %s beside a genuine one', async (_position, buildQuery) => {
      const cookie = await signUp();
      const link = await requestChangeLink(cookie);
      const genuine = genuineToken(link);
      const forged = wrongKeyToken(changeClaims(NEW_EMAIL));
      clearSent();

      const res = await request(`${AuthEndpoint.VERIFY_EMAIL}?${buildQuery(genuine, forged)}`);

      expect(res.status).toBe(400);
      expect(sent).toHaveLength(0);
      expect(await currentEmail(cookie)).toBe(EMAIL);
    });
  });

  it('rejects an invalid address and sends nothing', async () => {
    const cookie = await signUp();

    const res = await request('/change-email', { cookie, body: { newEmail: 'not-an-email' } });

    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('sends nothing when the address belongs to another account', async () => {
    const cookie = await signUp();
    await signUpWithEmail(request, { ...TEST_USER, name: 'Emperor', email: NEW_EMAIL });
    clearSent();

    await request('/change-email', { cookie, body: { newEmail: NEW_EMAIL } });

    expect(sent).toHaveLength(0);
    expect(await currentEmail(cookie)).toBe(EMAIL);
  });

  it('refuses a signed-out request', async () => {
    const res = await request('/change-email', { body: { newEmail: NEW_EMAIL } });

    expect(res.status).toBe(401);
    expect(sent).toHaveLength(0);
  });
});

describe('the user each email is recorded against', () => {
  const expectOnlyEmail = (email: string, userId: string) => {
    expect(sent.map((data) => data.to)).toEqual([{ email, userId }]);
  };

  it('is the new user for the sign-up verification email', async () => {
    const { cookie } = await signUpWithEmail(request, TEST_USER);

    expectOnlyEmail(EMAIL, await userIdOf(cookie));
  });

  it('is the user for a verification resend', async () => {
    const cookie = await signUp();

    await request('/send-verification-email', { body: { email: EMAIL } });

    expectOnlyEmail(EMAIL, await userIdOf(cookie));
  });

  it('is the user for a password reset link and the notice once it completes', async () => {
    const cookie = await signUp();
    const userId = await userIdOf(cookie);

    await request('/request-password-reset', { body: { email: EMAIL, redirectTo: RESET_REDIRECT } });
    expectOnlyEmail(EMAIL, userId);

    const token = new URL(emailedLink(sent[0])).pathname.split('/').pop();
    clearSent();
    await request('/reset-password', { body: { newPassword: NEW_PASSWORD, token } });
    expectOnlyEmail(EMAIL, userId);
  });

  it('is the user for a password change', async () => {
    const cookie = await signUp();

    await request('/change-password', { cookie, body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD } });

    expectOnlyEmail(EMAIL, await userIdOf(cookie));
  });

  it('is the user for recovery code use and regeneration', async () => {
    const {
      cookie,
      backupCodes: [code],
    } = await signUpWithTotp(request, TEST_USER);
    const userId = await userIdOf(cookie);
    const { challengeCookie } = await startTwoFactorSignIn(request, TEST_USER);
    clearSent();

    await request('/two-factor/verify-backup-code', { cookie: challengeCookie, body: { code } });
    expectOnlyEmail(EMAIL, userId);

    clearSent();
    await request('/two-factor/generate-backup-codes', { cookie, body: { password: PASSWORD } });
    expectOnlyEmail(EMAIL, userId);
  });

  it('is the user for an emailed two-factor code', async () => {
    const { cookie } = await signUpWithTotp(request, TEST_USER);
    const userId = await userIdOf(cookie);
    const { challengeCookie } = await startTwoFactorSignIn(request, TEST_USER);
    clearSent();

    await request('/two-factor/send-otp', { cookie: challengeCookie, body: {} });

    expectOnlyEmail(EMAIL, userId);
  });

  it('is the same user for an email change confirmation and the notice to the old address', async () => {
    const cookie = await signUp();
    const userId = await userIdOf(cookie);

    await request('/change-email', { cookie, body: { newEmail: NEW_EMAIL, callbackURL: '/email-verified' } });
    expectOnlyEmail(NEW_EMAIL, userId);

    const link = linkPath(sent.at(-1));
    clearSent();
    await request(link, { cookie });
    expectOnlyEmail(EMAIL, userId);
  });
});

describe('a failed send', () => {
  const VERIFIED_EMAIL = 'verified@example.com';

  useMailLog();

  // The message carries the address on purpose: a provider's error text can, and it must not reach this log.
  const failSends = () => mailerSend.mockRejectedValue(new Error(`useSend refused ${EMAIL} and ${NEW_EMAIL}`));

  function expectOneLogEntryWithoutAddresses(template: string) {
    expect(mailLog.error).toHaveBeenCalledTimes(1);
    expect(mailLog.error.mock.calls[0][0]).toEqual({ template });
    expect(mailLog.error.mock.calls[0][1]).toBe(SECURITY_EVENT_EMAIL_FAILED_LOG);
    const logged = JSON.stringify(mailLog.error.mock.calls[0]);
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain(NEW_EMAIL);
  }

  /**
   * A Link Email is given up on after the response has gone, so its entry is only there once the send has settled.
   * Waiting a macrotask lets every rejected send settle, and a second entry would show up too.
   */
  async function expectOneLinkEmailEntry(template: string) {
    await detachedSendsSettled();
    expect(mailLog.error).toHaveBeenCalledTimes(1);
    expect(mailLog.error.mock.calls[0]).toEqual([{ template }, AUTH_LINK_EMAIL_FAILED_LOG]);
    const logged = JSON.stringify(mailLog.error.mock.calls[0]);
    for (const secret of [EMAIL, NEW_EMAIL, 'http', 'useSend refused']) expect(logged).not.toContain(secret);
  }

  /** The password that signs in now, which proves the change committed. */
  const signInStatus = async (password: string) => (await request('/sign-in/email', { body: { email: EMAIL, password } })).status;

  describe('of a Security Event, after the change has committed', () => {
    it('does not fail a completed password reset', async () => {
      await signUp();
      await request('/request-password-reset', { body: { email: EMAIL, redirectTo: RESET_REDIRECT } });
      const link = emailedLink(sent[0]);
      failSends();

      const res = await request('/reset-password', { body: { newPassword: NEW_PASSWORD, token: new URL(link).pathname.split('/').pop() } });

      expect(res.status).toBe(200);
      expect(await signInStatus(NEW_PASSWORD)).toBe(200);
      expectOneLogEntryWithoutAddresses('PasswordChangedEmail');
    });

    it('does not fail a completed password change', async () => {
      const cookie = await signUp();
      failSends();

      const res = await request('/change-password', { cookie, body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD } });

      expect(res.status).toBe(200);
      expect(await signInStatus(NEW_PASSWORD)).toBe(200);
      expectOneLogEntryWithoutAddresses('PasswordChangedEmail');
    });

    it('still hands over regenerated recovery codes', async () => {
      const { cookie } = await signUpWithTotp(request, TEST_USER);
      failSends();

      const res = await request('/two-factor/generate-backup-codes', { cookie, body: { password: PASSWORD } });

      expect(res.status).toBe(200);
      expect(((await res.json()) as { backupCodes: string[] }).backupCodes.length).toBeGreaterThan(0);
      expectOneLogEntryWithoutAddresses('RecoveryCodesRegeneratedEmail');
    });

    it('still signs in with a recovery code', async () => {
      const {
        backupCodes: [code],
      } = await signUpWithTotp(request, TEST_USER);
      const { challengeCookie: cookie } = await startTwoFactorSignIn(request, TEST_USER);
      failSends();

      const res = await request('/two-factor/verify-backup-code', { cookie, body: { code } });

      expect(res.status).toBe(200);
      expect(cookiesFrom(res)).toContain('session_token');
      expectOneLogEntryWithoutAddresses('RecoveryCodesUsedEmail');
    });

    it('still completes an email change when the notice to the old address fails', async () => {
      const cookie = await signUp();
      await request('/change-email', { cookie, body: { newEmail: NEW_EMAIL, callbackURL: '/email-verified' } });
      const link = linkPath(sent.at(-1));
      failSends();

      const res = await request(link, { cookie });

      expect(res.status).toBeLessThan(400);
      expect(((await (await request('/get-session', { cookie })).json()) as { user: { email: string } }).user.email).toBe(NEW_EMAIL);
      expectOneLogEntryWithoutAddresses('EmailChangeNoticeEmail');
    });
  });

  /** Better Auth absorbs this one with a `.catch`, logs through its own logger and answers success. */
  it('still answers success when emailing a two-factor code', async () => {
    await signUpWithTotp(request, TEST_USER);
    const { challengeCookie: cookie } = await startTwoFactorSignIn(request, TEST_USER);
    failSends();

    const res = await request('/two-factor/send-otp', { cookie, body: {} });

    expect(res.status).toBe(200);
    expect(mailLog.error).not.toHaveBeenCalled();
  });

  describe('of a Link Email', () => {
    it('answers a verification resend the same for an unverified, a verified and an unknown address', async () => {
      await signUpWithEmail(request, TEST_USER);
      const { res: signedUp } = await signUpWithEmail(request, { ...TEST_USER, email: VERIFIED_EMAIL });
      expect(signedUp.status).toBe(200);
      await request(linkPath(sent.at(-1)));
      failSends();
      mailerSend.mockClear();

      const [unverified, verified, unknown] = await Promise.all(
        [EMAIL, VERIFIED_EMAIL, UNKNOWN_EMAIL].map((email) => request('/send-verification-email', { body: { email } })),
      );

      expect(unverified.status).toBe(200);
      expect(verified.status).toBe(200);
      expect(unknown.status).toBe(200);
      const body = await unknown.json();
      expect(await unverified.json()).toEqual(body);
      expect(await verified.json()).toEqual(body);
      // Only the unverified address is sent to, so the verified one really took the no-send path.
      expect(mailerSend).toHaveBeenCalledTimes(1);
      expect(mailerSend.mock.calls[0][0].to).toMatchObject({ email: EMAIL });
    });

    it('writes one entry naming the template when a verification resend is given up on', async () => {
      await signUp();
      failSends();

      await request('/send-verification-email', { body: { email: EMAIL } });

      await expectOneLinkEmailEntry('EmailVerificationEmail');
    });

    it('answers a signed-in verification resend with success', async () => {
      const cookie = await signUp();
      failSends();

      const res = await request('/send-verification-email', { cookie, body: { email: EMAIL } });

      expect(res.status).toBe(200);
      await expectOneLinkEmailEntry('EmailVerificationEmail');
    });

    it('answers a known address exactly as an unknown one on password reset', async () => {
      await signUp();
      failSends();

      const [known, unknown] = await Promise.all(
        [EMAIL, UNKNOWN_EMAIL].map((email) => request('/request-password-reset', { body: { email, redirectTo: RESET_REDIRECT } })),
      );

      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(await known.json()).toEqual(await unknown.json());
      await expectOneLinkEmailEntry('PasswordResetLinkEmail');
    });

    it('still answers success on sign-up', async () => {
      failSends();

      const { res } = await signUpWithEmail(request, TEST_USER);

      expect(res.status).toBe(200);
      await expectOneLinkEmailEntry('EmailVerificationEmail');
    });

    it('still answers success on an email change request', async () => {
      const cookie = await signUp();
      failSends();

      const res = await request('/change-email', { cookie, body: { newEmail: NEW_EMAIL, callbackURL: '/email-verified' } });

      expect(res.status).toBe(200);
      await expectOneLinkEmailEntry('EmailChangeRequestEmail');
    });
  });
});

/** The proof that a response does not wait on the send: if it did, these would never finish. */
describe('a send that never resolves', () => {
  useMailLog();

  const hangSends = () => mailerSend.mockReturnValue(new Promise(() => {}));

  it('still answers a verification resend', async () => {
    await signUp();
    hangSends();

    const res = await request('/send-verification-email', { body: { email: EMAIL } });

    expect(res.status).toBe(200);
  });

  it('still answers a password reset request', async () => {
    await signUp();
    hangSends();

    const res = await request('/request-password-reset', { body: { email: EMAIL, redirectTo: RESET_REDIRECT } });

    expect(res.status).toBe(200);
  });
});

describe('a Link Email that goes through', () => {
  useMailLog();

  it('answers a verification resend and sends the link', async () => {
    await signUp();

    const res = await request('/send-verification-email', { body: { email: EMAIL } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: true });
    expect(sentTemplates()).toHaveLength(1);
    expect(sentTemplates()[0]).toBeInstanceOf(EmailVerificationEmail);
    await detachedSendsSettled();
    expect(mailLog.error).not.toHaveBeenCalled();
  });

  it('answers a password reset request and sends the link', async () => {
    await signUp();

    const res = await request('/request-password-reset', { body: { email: EMAIL, redirectTo: RESET_REDIRECT } });

    expect(res.status).toBe(200);
    expect(sentTemplates()).toHaveLength(1);
    expect(sentTemplates()[0]).toBeInstanceOf(PasswordResetLinkEmail);
    await detachedSendsSettled();
    expect(mailLog.error).not.toHaveBeenCalled();
  });
});
