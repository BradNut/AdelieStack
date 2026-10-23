import { AUTH_BASE_PATH } from '@adelie/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SendProps } from '#lib/server/api/mail/interfaces/mailer.interface';
import { EmailChangeNoticeEmail } from '#lib/server/api/mail/templates/email-change-notice.template';
import { EmailChangeRequestEmail } from '#lib/server/api/mail/templates/email-change-request.template';
import { EmailVerificationEmail } from '#lib/server/api/mail/templates/email-verification.template';
import { PasswordChangedEmail } from '#lib/server/api/mail/templates/password-changed.template';
import { PasswordResetLinkEmail } from '#lib/server/api/mail/templates/password-reset-link.template';
import { RecoveryCodesRegeneratedEmail } from '#lib/server/api/mail/templates/recovery-codes-regenerated.template';
import { RecoveryCodesUsedEmail } from '#lib/server/api/mail/templates/recovery-codes-used.template';
import { type AuthRequest, cookiesFrom, signUpWithTotp, startTwoFactorSignIn } from '../../../../../test/auth-http';
import { createTestAuth, TEST_ORIGIN } from '../../../../../test/auth-instance';

const PASSWORD = 'Correct-horse-9';
const NEW_PASSWORD = 'Another-pass-7';
const EMAIL = 'penguin@example.com';
const USER = { name: 'Penguin', email: EMAIL, password: PASSWORD };

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
  const res = await request('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } });
  clearSent();
  return cookiesFrom(res);
}

beforeEach(() => {
  const testAuth = createTestAuth();
  request = testAuth.request;
  sent = testAuth.mailer.sent;
});

describe('verification email', () => {
  it('is sent to the new user on sign-up', async () => {
    await request('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(EMAIL);
    expect(sent[0].template).toBeInstanceOf(EmailVerificationEmail);
    expect(sent[0].template.html()).toContain('/api/auth/verify-email?token=');
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
    const { cookie } = await signUpWithTotp(request, USER);
    clearSent();

    const res = await request('/two-factor/generate-backup-codes', { cookie, body: { password: PASSWORD } });

    expect(res.ok).toBe(true);
    expect(sentTemplates()).toHaveLength(1);
    expect(sentTemplates()[0]).toBeInstanceOf(RecoveryCodesRegeneratedEmail);
  });

  it('sends nothing when regeneration is refused', async () => {
    const { cookie } = await signUpWithTotp(request, USER);
    clearSent();

    const res = await request('/two-factor/generate-backup-codes', { cookie, body: { password: 'wrong-password-123' } });

    expect(res.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('sends one email when a recovery code is used, and none for an invalid code', async () => {
    const {
      backupCodes: [code],
    } = await signUpWithTotp(request, USER);
    // Recovery codes are a sign-in step: the password sign-in leaves a two-factor challenge cookie.
    const { challengeCookie: cookie } = await startTwoFactorSignIn(request, USER);
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
    await request('/sign-up/email', { body: { name: 'Emperor', email: NEW_EMAIL, password: PASSWORD } });
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
