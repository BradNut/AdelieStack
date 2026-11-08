import { AUTH_BASE_PATH } from '@adelie/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SECURITY_EVENT_EMAIL_FAILED_LOG } from '#lib/server/api/auth/auth.mail';
import type { SendProps } from '#lib/server/api/mail/interfaces/mailer.interface';
import { EmailChangeNoticeEmail } from '#lib/server/api/mail/templates/email-change-notice.template';
import { EmailChangeRequestEmail } from '#lib/server/api/mail/templates/email-change-request.template';
import { EmailVerificationEmail } from '#lib/server/api/mail/templates/email-verification.template';
import { PasswordChangedEmail } from '#lib/server/api/mail/templates/password-changed.template';
import { PasswordResetLinkEmail } from '#lib/server/api/mail/templates/password-reset-link.template';
import { RecoveryCodesRegeneratedEmail } from '#lib/server/api/mail/templates/recovery-codes-regenerated.template';
import { RecoveryCodesUsedEmail } from '#lib/server/api/mail/templates/recovery-codes-used.template';
import { type AuthRequest, cookiesFrom, signUpWithEmail, signUpWithTotp, startTwoFactorSignIn, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth, TEST_ORIGIN } from '../../../../../test/auth-instance';

const { email: EMAIL, password: PASSWORD } = TEST_USER;
const NEW_PASSWORD = 'Another-pass-7';

let request: AuthRequest;
let sent: SendProps[];

/** Forgets the mail sent so far, so a test only sees what its action sends. */
function clearSent() {
  sent.length = 0;
}

function sentTemplates() {
  return sent.map((data) => data.template);
}

async function signUp() {
  const { cookie } = await signUpWithEmail(request, TEST_USER);
  clearSent();
  return cookie;
}

beforeEach(() => {
  const testAuth = createTestAuth();
  request = testAuth.request;
  sent = testAuth.mailer.sent;
});

describe('verification email', () => {
  it('is sent to the new user on sign-up', async () => {
    await signUpWithEmail(request, TEST_USER);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(EMAIL);
    expect(sent[0].template).toBeInstanceOf(EmailVerificationEmail);
    expect(sent[0].template.html()).toContain(`${AUTH_BASE_PATH}/verify-email?token=`);
  });
});

describe('password reset', () => {
  it('emails a reset link to a known user', async () => {
    await signUp();

    await request('/request-password-reset', { body: { email: EMAIL, redirectTo: `${TEST_ORIGIN}/reset` } });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(EMAIL);
    expect(sent[0].template).toBeInstanceOf(PasswordResetLinkEmail);
  });

  it('sends nothing for an unknown address', async () => {
    await request('/request-password-reset', { body: { email: 'nobody@example.com', redirectTo: `${TEST_ORIGIN}/reset` } });

    expect(sent).toHaveLength(0);
  });

  it('sends one password-changed email once the reset completes', async () => {
    await signUp();
    await request('/request-password-reset', { body: { email: EMAIL, redirectTo: `${TEST_ORIGIN}/reset` } });
    const link = (sent[0].template.html().match(/href='([^']+)'/) ?? [])[1];
    const token = new URL(link).pathname.split('/').pop();
    clearSent();

    const res = await request('/reset-password', { body: { newPassword: NEW_PASSWORD, token } });

    expect(res.ok).toBe(true);
    expect(sentTemplates()).toHaveLength(1);
    expect(sentTemplates()[0]).toBeInstanceOf(PasswordChangedEmail);
    expect(sent[0].to).toBe(EMAIL);
  });
});

describe('security-event emails', () => {
  it('sends one email when the password is changed', async () => {
    const cookie = await signUp();

    const res = await request('/change-password', { cookie, body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD } });

    expect(res.ok).toBe(true);
    expect(sentTemplates()).toHaveLength(1);
    expect(sentTemplates()[0]).toBeInstanceOf(PasswordChangedEmail);
    expect(sent[0].to).toBe(EMAIL);
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

describe('email change', () => {
  const NEW_EMAIL = 'emperor@example.com';

  /** Follows the first link of the last email sent, the way a click in the mail client would. */
  async function followLastLink(cookie: string) {
    const html = sent.at(-1)?.template.html() ?? '';
    const href = /href='([^']+)'/.exec(html)?.[1] ?? '';
    return request(href.replace(TEST_ORIGIN, '').replace(AUTH_BASE_PATH, ''), { cookie });
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
    expect(sent[0].to).toBe(NEW_EMAIL);
    expect(sent[0].template).toBeInstanceOf(EmailChangeRequestEmail);
    expect(await currentEmail(cookie)).toBe(EMAIL);
  });

  it('changes the email and notifies the old address once the link is followed', async () => {
    const cookie = await signUp();
    await request('/change-email', { cookie, body: { newEmail: NEW_EMAIL, callbackURL: '/email-verified' } });

    await followLastLink(cookie);

    expect(await currentEmail(cookie)).toBe(NEW_EMAIL);
    expect(sent).toHaveLength(2);
    expect(sent[1].to).toBe(EMAIL);
    expect(sent[1].template).toBeInstanceOf(EmailChangeNoticeEmail);
    expect(sent[1].template.html()).toContain(NEW_EMAIL);
  });

  it('sends the notice only once if the link is followed again', async () => {
    const cookie = await signUp();
    await request('/change-email', { cookie, body: { newEmail: NEW_EMAIL, callbackURL: '/email-verified' } });

    await followLastLink(cookie);
    await followLastLink(cookie);

    expect(sentTemplates().filter((t) => t instanceof EmailChangeNoticeEmail)).toHaveLength(1);
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

describe('a failed send', () => {
  const NEW_EMAIL = 'emperor@example.com';
  const mailLog = { error: vi.fn() };
  let failSends: () => void;

  beforeEach(() => {
    mailLog.error.mockReset();
    const testAuth = createTestAuth({ mailLog });
    request = testAuth.request;
    sent = testAuth.mailer.sent;
    // The message carries the address on purpose: a provider's error text can, and it must not reach this log.
    failSends = () => testAuth.mailer.send.mockRejectedValue(new Error(`useSend refused ${EMAIL} and ${NEW_EMAIL}`));
  });

  function expectOneLogEntryWithoutAddresses() {
    expect(mailLog.error).toHaveBeenCalledTimes(1);
    expect(mailLog.error.mock.calls[0][1]).toBe(SECURITY_EVENT_EMAIL_FAILED_LOG);
    const logged = JSON.stringify(mailLog.error.mock.calls[0]);
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain(NEW_EMAIL);
  }

  /** The password that signs in now, which proves the change committed. */
  const signInStatus = async (password: string) => (await request('/sign-in/email', { body: { email: EMAIL, password } })).status;

  describe('of a Security Event, after the change has committed', () => {
    it('does not fail a completed password reset', async () => {
      await signUp();
      await request('/request-password-reset', { body: { email: EMAIL, redirectTo: `${TEST_ORIGIN}/reset` } });
      const link = /href='([^']+)'/.exec(sent[0].template.html())?.[1] ?? '';
      failSends();

      const res = await request('/reset-password', { body: { newPassword: NEW_PASSWORD, token: new URL(link).pathname.split('/').pop() } });

      expect(res.status).toBe(200);
      expect(await signInStatus(NEW_PASSWORD)).toBe(200);
      expectOneLogEntryWithoutAddresses();
    });

    it('does not fail a completed password change', async () => {
      const cookie = await signUp();
      failSends();

      const res = await request('/change-password', { cookie, body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD } });

      expect(res.status).toBe(200);
      expect(await signInStatus(NEW_PASSWORD)).toBe(200);
      expectOneLogEntryWithoutAddresses();
    });

    it('still hands over regenerated recovery codes', async () => {
      const { cookie } = await signUpWithTotp(request, TEST_USER);
      failSends();

      const res = await request('/two-factor/generate-backup-codes', { cookie, body: { password: PASSWORD } });

      expect(res.status).toBe(200);
      expect(((await res.json()) as { backupCodes: string[] }).backupCodes.length).toBeGreaterThan(0);
      expectOneLogEntryWithoutAddresses();
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
      expectOneLogEntryWithoutAddresses();
    });

    it('still completes an email change when the notice to the old address fails', async () => {
      const cookie = await signUp();
      await request('/change-email', { cookie, body: { newEmail: NEW_EMAIL, callbackURL: '/email-verified' } });
      const href = /href='([^']+)'/.exec(sent.at(-1)?.template.html() ?? '')?.[1] ?? '';
      failSends();

      const res = await request(href.replace(TEST_ORIGIN, '').replace(AUTH_BASE_PATH, ''), { cookie });

      expect(res.status).toBeLessThan(400);
      expect(((await (await request('/get-session', { cookie })).json()) as { user: { email: string } }).user.email).toBe(NEW_EMAIL);
      expectOneLogEntryWithoutAddresses();
    });
  });

  /**
   * Better Auth wraps these sends itself (`runInBackgroundOrAwait`, and a `.catch` for the code), logs through its own
   * logger and answers success. These fail if a Better Auth upgrade changes that.
   */
  describe('that Better Auth absorbs', () => {
    it('answers a known address exactly as an unknown one on password reset', async () => {
      await signUp();
      const unknown = await request('/request-password-reset', { body: { email: 'nobody@example.com', redirectTo: `${TEST_ORIGIN}/reset` } });
      failSends();

      const known = await request('/request-password-reset', { body: { email: EMAIL, redirectTo: `${TEST_ORIGIN}/reset` } });

      expect(known.status).toBe(unknown.status);
      expect(await known.json()).toEqual(await unknown.json());
    });

    it('still answers success on sign-up', async () => {
      failSends();

      const { res } = await signUpWithEmail(request, TEST_USER);

      expect(res.status).toBe(200);
      expect(mailLog.error).not.toHaveBeenCalled();
    });

    it('still answers success on an email change request', async () => {
      const cookie = await signUp();
      failSends();

      const res = await request('/change-email', { cookie, body: { newEmail: NEW_EMAIL, callbackURL: '/email-verified' } });

      expect(res.status).toBe(200);
      expect(mailLog.error).not.toHaveBeenCalled();
    });

    it('still answers success when emailing a two-factor code', async () => {
      await signUpWithTotp(request, TEST_USER);
      const { challengeCookie: cookie } = await startTwoFactorSignIn(request, TEST_USER);
      failSends();

      const res = await request('/two-factor/send-otp', { cookie, body: {} });

      expect(res.status).toBe(200);
      expect(mailLog.error).not.toHaveBeenCalled();
    });
  });

  /** Better Auth awaits this send bare, so the failure reaches the caller; left as is, the user needs this mail. */
  it('fails a verification resend', async () => {
    await signUp();
    failSends();

    const res = await request('/send-verification-email', { body: { email: EMAIL } });

    expect(res.status).toBe(500);
    expect(mailLog.error).not.toHaveBeenCalled();
  });
});
