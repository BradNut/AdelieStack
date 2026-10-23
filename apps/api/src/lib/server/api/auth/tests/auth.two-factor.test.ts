import { TWO_FACTOR_OTP_PERIOD_MINUTES } from '@adelie/shared';
import { totpCode } from '@adelie/test-utils/totp';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Auth, createAuth } from '#lib/server/api/auth/auth.config';
import type { SendProps } from '#lib/server/api/mail/interfaces/mailer.interface';
import { cookiesFrom, signUpWithTotp, startTwoFactorSignIn } from '../../../../../test/auth-http';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Correct-horse-9';
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

async function hasSession(cookie: string) {
  const session = await (await call('/get-session', { cookie })).json();
  return session !== null;
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

describe('two-factor enrolment', () => {
  it('issues a TOTP URI for the configured issuer and recovery codes at enrolment', async () => {
    const signUp = await call('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } });
    const cookie = cookiesFrom(signUp);

    const res = await call('/two-factor/enable', { cookie, body: { password: PASSWORD } });
    const { totpURI, backupCodes } = (await res.json()) as { totpURI: string; backupCodes: string[] };

    expect(res.status).toBe(200);
    expect(totpURI).toContain('AdelieStack');
    expect(backupCodes.length).toBeGreaterThan(0);
  });

  it('requires the account password to enrol', async () => {
    const signUp = await call('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } });

    const res = await call('/two-factor/enable', { cookie: cookiesFrom(signUp), body: { password: 'wrong-password-123' } });

    expect(res.ok).toBe(false);
  });

  it('rejects a wrong code at enrolment', async () => {
    const signUp = await call('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } });
    const cookie = cookiesFrom(signUp);
    const enable = await call('/two-factor/enable', { cookie, body: { password: PASSWORD } });
    const { totpURI } = (await enable.json()) as { totpURI: string };
    const wrong = totpCode(totpURI) === '000000' ? '111111' : '000000';

    const res = await call('/two-factor/verify-totp', { cookie, body: { code: wrong } });

    expect(res.ok).toBe(false);
  });
});

describe('sign-in with a TOTP code', () => {
  it('asks for a second factor after the password and signs in with a valid code', async () => {
    const { totpURI } = await signUpWithTotp(call, USER);

    const { challengeCookie, twoFactorRedirect } = await startTwoFactorSignIn(call, USER);
    expect(twoFactorRedirect).toBe(true);
    expect(await hasSession(challengeCookie)).toBe(false);

    const res = await call('/two-factor/verify-totp', { cookie: challengeCookie, body: { code: totpCode(totpURI) } });

    expect(res.status).toBe(200);
    expect(await hasSession(cookiesFrom(res, challengeCookie))).toBe(true);
  });

  it('rejects a wrong code', async () => {
    const { totpURI } = await signUpWithTotp(call, USER);
    const { challengeCookie } = await startTwoFactorSignIn(call, USER);
    const wrong = totpCode(totpURI) === '000000' ? '111111' : '000000';

    const res = await call('/two-factor/verify-totp', { cookie: challengeCookie, body: { code: wrong } });

    expect(res.ok).toBe(false);
    expect(await hasSession(cookiesFrom(res, challengeCookie))).toBe(false);
  });

  it('rejects an expired code', async () => {
    const { totpURI } = await signUpWithTotp(call, USER);
    const { challengeCookie } = await startTwoFactorSignIn(call, USER);

    const res = await call('/two-factor/verify-totp', { cookie: challengeCookie, body: { code: totpCode(totpURI, -10) } });

    expect(res.ok).toBe(false);
  });
});

describe('sign-in with a recovery code', () => {
  it('signs in with a recovery code once, and rejects the same code afterwards', async () => {
    const { backupCodes } = await signUpWithTotp(call, USER);
    const [code] = backupCodes;

    const first = await startTwoFactorSignIn(call, USER);
    const used = await call('/two-factor/verify-backup-code', { cookie: first.challengeCookie, body: { code } });
    expect(used.status).toBe(200);
    expect(await hasSession(cookiesFrom(used, first.challengeCookie))).toBe(true);

    const second = await startTwoFactorSignIn(call, USER);
    const reused = await call('/two-factor/verify-backup-code', { cookie: second.challengeCookie, body: { code } });
    expect(reused.ok).toBe(false);
    expect(await hasSession(cookiesFrom(reused, second.challengeCookie))).toBe(false);
  });

  it('rejects a code that was never issued', async () => {
    await signUpWithTotp(call, USER);
    const { challengeCookie } = await startTwoFactorSignIn(call, USER);

    const res = await call('/two-factor/verify-backup-code', { cookie: challengeCookie, body: { code: 'aaaaa-bbbbb' } });

    expect(res.ok).toBe(false);
  });
});

describe('sign-in with an emailed OTP', () => {
  it('emails the code through the mailer and signs in with it', async () => {
    await signUpWithTotp(call, USER);
    const { challengeCookie } = await startTwoFactorSignIn(call, USER);
    send.mockClear(); // drop the sign-up verification email

    const sent = await call('/two-factor/send-otp', { cookie: challengeCookie, body: {} });
    expect(sent.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    const { to, template } = send.mock.calls[0][0];
    expect(to).toBe(EMAIL);
    expect(template.subject()).toBe('Your sign-in code');
    const otp = template.html().match(/token-text'>(\d+)</)?.[1];
    expect(otp).toBeDefined();
    expect(template.html()).toContain(`valid for ${TWO_FACTOR_OTP_PERIOD_MINUTES} minutes`);

    const res = await call('/two-factor/verify-otp', { cookie: challengeCookie, body: { code: otp } });

    expect(res.status).toBe(200);
    expect(await hasSession(cookiesFrom(res, challengeCookie))).toBe(true);
  });

  it('rejects a wrong emailed code', async () => {
    await signUpWithTotp(call, USER);
    const { challengeCookie } = await startTwoFactorSignIn(call, USER);
    await call('/two-factor/send-otp', { cookie: challengeCookie, body: {} });
    const otp = send.mock.calls[0][0].template.html().match(/token-text'>(\d+)</)?.[1] ?? '';
    const wrong = otp === '000000' ? '111111' : '000000';

    const res = await call('/two-factor/verify-otp', { cookie: challengeCookie, body: { code: wrong } });

    expect(res.ok).toBe(false);
  });
});
