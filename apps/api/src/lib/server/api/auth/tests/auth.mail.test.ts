import { memoryAdapter } from 'better-auth/adapters/memory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendProps } from '../../mail/interfaces/mailer.interface';
import { EmailVerificationEmail } from '../../mail/templates/email-verification.template';
import { PasswordChangedEmail } from '../../mail/templates/password-changed.template';
import { PasswordResetLinkEmail } from '../../mail/templates/password-reset-link.template';
import { RecoveryCodesRegeneratedEmail } from '../../mail/templates/recovery-codes-regenerated.template';
import { RecoveryCodesUsedEmail } from '../../mail/templates/recovery-codes-used.template';
import { type Auth, createAuth } from '../auth.config';
import { totpCode } from './totp';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'another-long-password';
const EMAIL = 'penguin@example.com';

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

function cookiesFrom(res: Response, previous = ''): string {
  const jar = new Map(
    previous
      .split('; ')
      .filter(Boolean)
      .map((c) => [c.split('=')[0], c] as const),
  );
  for (const c of res.headers.getSetCookie()) {
    const pair = c.split(';')[0];
    jar.set(pair.split('=')[0], pair);
  }
  return [...jar.values()].join('; ');
}

function sentTemplates() {
  return send.mock.calls.map(([data]) => data.template);
}

async function signUp() {
  const res = await call('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } });
  send.mockClear();
  return cookiesFrom(res);
}

/** Enrols two-factor, confirms it with a first TOTP code and returns the recovery codes. */
async function enrol(cookie: string) {
  const res = await call('/two-factor/enable', { cookie, body: { password: PASSWORD } });
  const { totpURI, backupCodes } = (await res.json()) as { totpURI: string; backupCodes: string[] };
  const verify = await call('/two-factor/verify-totp', { cookie, body: { code: totpCode(totpURI) } });
  send.mockClear();
  return { backupCodes, cookie: cookiesFrom(verify, cookie) };
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
    const { cookie } = await enrol(await signUp());

    const res = await call('/two-factor/generate-backup-codes', { cookie, body: { password: PASSWORD } });

    expect(res.ok).toBe(true);
    expect(sentTemplates()).toHaveLength(1);
    expect(sentTemplates()[0]).toBeInstanceOf(RecoveryCodesRegeneratedEmail);
  });

  it('sends nothing when regeneration is refused', async () => {
    const { cookie } = await enrol(await signUp());

    const res = await call('/two-factor/generate-backup-codes', { cookie, body: { password: 'wrong-password-123' } });

    expect(res.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends one email when a recovery code is used, and none for an invalid code', async () => {
    const {
      backupCodes: [code],
    } = await enrol(await signUp());
    // Recovery codes are a sign-in step: the password sign-in leaves a two-factor challenge cookie.
    const cookie = cookiesFrom(await call('/sign-in/email', { body: { email: EMAIL, password: PASSWORD } }));
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
