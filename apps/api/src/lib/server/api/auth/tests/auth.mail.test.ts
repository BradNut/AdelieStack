import { memoryAdapter } from 'better-auth/adapters/memory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Auth, createAuth } from '#lib/server/api/auth/auth.config';
import type { SendProps } from '#lib/server/api/mail/interfaces/mailer.interface';
import { EmailChangeNoticeEmail } from '#lib/server/api/mail/templates/email-change-notice.template';
import { EmailChangeRequestEmail } from '#lib/server/api/mail/templates/email-change-request.template';
import { EmailVerificationEmail } from '#lib/server/api/mail/templates/email-verification.template';
import { PasswordChangedEmail } from '#lib/server/api/mail/templates/password-changed.template';
import { PasswordResetLinkEmail } from '#lib/server/api/mail/templates/password-reset-link.template';
import { RecoveryCodesRegeneratedEmail } from '#lib/server/api/mail/templates/recovery-codes-regenerated.template';
import { RecoveryCodesUsedEmail } from '#lib/server/api/mail/templates/recovery-codes-used.template';
import { cookiesFrom, signUpWithTotp, startTwoFactorSignIn } from '../../../../../test/auth-http';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Correct-horse-9';
const NEW_PASSWORD = 'Another-pass-7';
const EMAIL = 'penguin@example.com';
const USER = { name: 'Penguin', email: EMAIL, password: PASSWORD };

let auth: Auth;
const send = vi.fn<(data: SendProps) => Promise<void>>();

async function call(path: string, { body, cookie }: { body?: unknown; cookie?: string } = {}) {
  const headers = new Headers({ origin: ORIGIN });
  if (cookie) headers.set('cookie', cookie);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

function sentTemplates() {
  return send.mock.calls.map(([data]) => data.template);
}

async function signUp() {
  const res = await call('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } });
  send.mockClear();
  return cookiesFrom(res);
}

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue();
  auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], twoFactor: [] }),
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    twoFactorIssuer: 'AdelieStack',
    passkey: { rpID: 'localhost', rpName: 'AdelieStack', origin: ORIGIN },
    mailer: { send },
    signUpEnabled: true,
    // These tests are not about breached passwords: keep them off the network.
    hibpEnabled: false,
  });
});

describe('verification email', () => {
  it('is sent to the new user on sign-up', async () => {
    await call('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe(EMAIL);
    expect(send.mock.calls[0][0].template).toBeInstanceOf(EmailVerificationEmail);
    expect(send.mock.calls[0][0].template.html()).toContain('/api/auth/verify-email?token=');
  });
});

describe('password reset', () => {
  it('emails a reset link to a known user', async () => {
    await signUp();

    await call('/request-password-reset', { body: { email: EMAIL, redirectTo: `${ORIGIN}/reset` } });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe(EMAIL);
    expect(send.mock.calls[0][0].template).toBeInstanceOf(PasswordResetLinkEmail);
  });

  it('sends nothing for an unknown address', async () => {
    await call('/request-password-reset', { body: { email: 'nobody@example.com', redirectTo: `${ORIGIN}/reset` } });

    expect(send).not.toHaveBeenCalled();
  });

  it('sends one password-changed email once the reset completes', async () => {
    await signUp();
    await call('/request-password-reset', { body: { email: EMAIL, redirectTo: `${ORIGIN}/reset` } });
    const link = (send.mock.calls[0][0].template.html().match(/href='([^']+)'/) ?? [])[1];
    const token = new URL(link).pathname.split('/').pop();
    send.mockClear();

    const res = await call('/reset-password', { body: { newPassword: NEW_PASSWORD, token } });

    expect(res.ok).toBe(true);
    expect(sentTemplates()).toHaveLength(1);
    expect(sentTemplates()[0]).toBeInstanceOf(PasswordChangedEmail);
    expect(send.mock.calls[0][0].to).toBe(EMAIL);
  });
});

describe('security-event emails', () => {
  it('sends one email when the password is changed', async () => {
    const cookie = await signUp();

    const res = await call('/change-password', { cookie, body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD } });

    expect(res.ok).toBe(true);
    expect(sentTemplates()).toHaveLength(1);
    expect(sentTemplates()[0]).toBeInstanceOf(PasswordChangedEmail);
    expect(send.mock.calls[0][0].to).toBe(EMAIL);
  });

  it('sends nothing when the current password is wrong', async () => {
    const cookie = await signUp();

    const res = await call('/change-password', { cookie, body: { currentPassword: 'wrong-password-123', newPassword: NEW_PASSWORD } });

    expect(res.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends one email when recovery codes are regenerated', async () => {
    const { cookie } = await signUpWithTotp(call, USER);
    send.mockClear();

    const res = await call('/two-factor/generate-backup-codes', { cookie, body: { password: PASSWORD } });

    expect(res.ok).toBe(true);
    expect(sentTemplates()).toHaveLength(1);
    expect(sentTemplates()[0]).toBeInstanceOf(RecoveryCodesRegeneratedEmail);
  });

  it('sends nothing when regeneration is refused', async () => {
    const { cookie } = await signUpWithTotp(call, USER);
    send.mockClear();

    const res = await call('/two-factor/generate-backup-codes', { cookie, body: { password: 'wrong-password-123' } });

    expect(res.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends one email when a recovery code is used, and none for an invalid code', async () => {
    const {
      backupCodes: [code],
    } = await signUpWithTotp(call, USER);
    // Recovery codes are a sign-in step: the password sign-in leaves a two-factor challenge cookie.
    const { challengeCookie: cookie } = await startTwoFactorSignIn(call, USER);
    send.mockClear();

    const bad = await call('/two-factor/verify-backup-code', { cookie, body: { code: 'not-a-real-code' } });
    expect(bad.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();

    const res = await call('/two-factor/verify-backup-code', { cookie, body: { code } });
    expect(res.ok).toBe(true);
    expect(sentTemplates()).toHaveLength(1);
    expect(sentTemplates()[0]).toBeInstanceOf(RecoveryCodesUsedEmail);
  });
});

describe('email change', () => {
  const NEW_EMAIL = 'emperor@example.com';

  /** Follows the first link of the last email sent, the way a click in the mail client would. */
  async function followLastLink(cookie: string) {
    const html = send.mock.calls.at(-1)?.[0].template.html() ?? '';
    const href = /href='([^']+)'/.exec(html)?.[1] ?? '';
    return call(href.replace(ORIGIN, '').replace('/api/auth', ''), { cookie });
  }

  async function currentEmail(cookie: string) {
    const session = (await (await call('/get-session', { cookie })).json()) as { user: { email: string } };
    return session.user.email;
  }

  it('sends the confirmation link to the new address only', async () => {
    const cookie = await signUp();

    const res = await call('/change-email', { cookie, body: { newEmail: NEW_EMAIL, callbackURL: '/email-verified' } });

    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe(NEW_EMAIL);
    expect(send.mock.calls[0][0].template).toBeInstanceOf(EmailChangeRequestEmail);
    expect(await currentEmail(cookie)).toBe(EMAIL);
  });

  it('changes the email and notifies the old address once the link is followed', async () => {
    const cookie = await signUp();
    await call('/change-email', { cookie, body: { newEmail: NEW_EMAIL, callbackURL: '/email-verified' } });

    await followLastLink(cookie);

    expect(await currentEmail(cookie)).toBe(NEW_EMAIL);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].to).toBe(EMAIL);
    expect(send.mock.calls[1][0].template).toBeInstanceOf(EmailChangeNoticeEmail);
    expect(send.mock.calls[1][0].template.html()).toContain(NEW_EMAIL);
  });

  it('sends the notice only once if the link is followed again', async () => {
    const cookie = await signUp();
    await call('/change-email', { cookie, body: { newEmail: NEW_EMAIL, callbackURL: '/email-verified' } });

    await followLastLink(cookie);
    await followLastLink(cookie);

    expect(sentTemplates().filter((t) => t instanceof EmailChangeNoticeEmail)).toHaveLength(1);
  });

  it('rejects an invalid address and sends nothing', async () => {
    const cookie = await signUp();

    const res = await call('/change-email', { cookie, body: { newEmail: 'not-an-email' } });

    expect(res.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends nothing when the address belongs to another account', async () => {
    const cookie = await signUp();
    await call('/sign-up/email', { body: { name: 'Emperor', email: NEW_EMAIL, password: PASSWORD } });
    send.mockClear();

    await call('/change-email', { cookie, body: { newEmail: NEW_EMAIL } });

    expect(send).not.toHaveBeenCalled();
    expect(await currentEmail(cookie)).toBe(EMAIL);
  });

  it('refuses a signed-out request', async () => {
    const res = await call('/change-email', { body: { newEmail: NEW_EMAIL } });

    expect(res.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });
});
