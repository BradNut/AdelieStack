import { APP_NAME, TWO_FACTOR_OTP_PERIOD_MINUTES } from '@adelie/shared';
import { totpCode } from '@adelie/test-utils/totp';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SendProps } from '#lib/server/api/mail/interfaces/mailer.interface';
import { type AuthRequest, cookiesFrom, signUpWithTotp, startTwoFactorSignIn } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const PASSWORD = 'Correct-horse-9';
const EMAIL = 'penguin@example.com';
const USER = { name: 'Penguin', email: EMAIL, password: PASSWORD };

let request: AuthRequest;
let sent: SendProps[];

/** Forgets the mail sent so far, so a test only sees what its action sends. */
function clearSent() {
  sent.length = 0;
}

async function hasSession(cookie: string) {
  const session = await (await request('/get-session', { cookie })).json();
  return session !== null;
}

beforeEach(() => {
  const testAuth = createTestAuth();
  request = testAuth.request;
  sent = testAuth.mailer.sent;
});

describe('two-factor enrolment', () => {
  it('issues a TOTP URI for the configured issuer and recovery codes at enrolment', async () => {
    const signUp = await request('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } });
    const cookie = cookiesFrom(signUp);

    const res = await request('/two-factor/enable', { cookie, body: { password: PASSWORD } });
    const { totpURI, backupCodes } = (await res.json()) as { totpURI: string; backupCodes: string[] };

    expect(res.status).toBe(200);
    expect(totpURI).toContain(APP_NAME);
    expect(backupCodes.length).toBeGreaterThan(0);
  });

  it('requires the account password to enrol', async () => {
    const signUp = await request('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } });

    const res = await request('/two-factor/enable', { cookie: cookiesFrom(signUp), body: { password: 'wrong-password-123' } });

    expect(res.ok).toBe(false);
  });

  it('rejects a wrong code at enrolment', async () => {
    const signUp = await request('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } });
    const cookie = cookiesFrom(signUp);
    const enable = await request('/two-factor/enable', { cookie, body: { password: PASSWORD } });
    const { totpURI } = (await enable.json()) as { totpURI: string };
    const wrong = totpCode(totpURI) === '000000' ? '111111' : '000000';

    const res = await request('/two-factor/verify-totp', { cookie, body: { code: wrong } });

    expect(res.ok).toBe(false);
  });
});

describe('sign-in with a TOTP code', () => {
  it('asks for a second factor after the password and signs in with a valid code', async () => {
    const { totpURI } = await signUpWithTotp(request, USER);

    const { challengeCookie, twoFactorRedirect } = await startTwoFactorSignIn(request, USER);
    expect(twoFactorRedirect).toBe(true);
    expect(await hasSession(challengeCookie)).toBe(false);

    const res = await request('/two-factor/verify-totp', { cookie: challengeCookie, body: { code: totpCode(totpURI) } });

    expect(res.status).toBe(200);
    expect(await hasSession(cookiesFrom(res, challengeCookie))).toBe(true);
  });

  it('rejects a wrong code', async () => {
    const { totpURI } = await signUpWithTotp(request, USER);
    const { challengeCookie } = await startTwoFactorSignIn(request, USER);
    const wrong = totpCode(totpURI) === '000000' ? '111111' : '000000';

    const res = await request('/two-factor/verify-totp', { cookie: challengeCookie, body: { code: wrong } });

    expect(res.ok).toBe(false);
    expect(await hasSession(cookiesFrom(res, challengeCookie))).toBe(false);
  });

  it('rejects an expired code', async () => {
    const { totpURI } = await signUpWithTotp(request, USER);
    const { challengeCookie } = await startTwoFactorSignIn(request, USER);

    const res = await request('/two-factor/verify-totp', { cookie: challengeCookie, body: { code: totpCode(totpURI, -10) } });

    expect(res.ok).toBe(false);
  });
});

describe('sign-in with a recovery code', () => {
  it('signs in with a recovery code once, and rejects the same code afterwards', async () => {
    const { backupCodes } = await signUpWithTotp(request, USER);
    const [code] = backupCodes;

    const first = await startTwoFactorSignIn(request, USER);
    const used = await request('/two-factor/verify-backup-code', { cookie: first.challengeCookie, body: { code } });
    expect(used.status).toBe(200);
    expect(await hasSession(cookiesFrom(used, first.challengeCookie))).toBe(true);

    const second = await startTwoFactorSignIn(request, USER);
    const reused = await request('/two-factor/verify-backup-code', { cookie: second.challengeCookie, body: { code } });
    expect(reused.ok).toBe(false);
    expect(await hasSession(cookiesFrom(reused, second.challengeCookie))).toBe(false);
  });

  it('rejects a code that was never issued', async () => {
    await signUpWithTotp(request, USER);
    const { challengeCookie } = await startTwoFactorSignIn(request, USER);

    const res = await request('/two-factor/verify-backup-code', { cookie: challengeCookie, body: { code: 'aaaaa-bbbbb' } });

    expect(res.ok).toBe(false);
  });
});

describe('sign-in with an emailed OTP', () => {
  it('emails the code through the mailer and signs in with it', async () => {
    await signUpWithTotp(request, USER);
    const { challengeCookie } = await startTwoFactorSignIn(request, USER);
    clearSent(); // drop the sign-up verification email

    const otpRes = await request('/two-factor/send-otp', { cookie: challengeCookie, body: {} });
    expect(otpRes.status).toBe(200);
    expect(sent).toHaveLength(1);
    const { to, template } = sent[0];
    expect(to).toBe(EMAIL);
    expect(template.subject()).toBe('Your sign-in code');
    const otp = template.html().match(/token-text'>(\d+)</)?.[1];
    expect(otp).toBeDefined();
    expect(template.html()).toContain(`valid for ${TWO_FACTOR_OTP_PERIOD_MINUTES} minutes`);

    const res = await request('/two-factor/verify-otp', { cookie: challengeCookie, body: { code: otp } });

    expect(res.status).toBe(200);
    expect(await hasSession(cookiesFrom(res, challengeCookie))).toBe(true);
  });

  it('rejects a wrong emailed code', async () => {
    await signUpWithTotp(request, USER);
    const { challengeCookie } = await startTwoFactorSignIn(request, USER);
    await request('/two-factor/send-otp', { cookie: challengeCookie, body: {} });
    const otp = sent[0].template.html().match(/token-text'>(\d+)</)?.[1] ?? '';
    const wrong = otp === '000000' ? '111111' : '000000';

    const res = await request('/two-factor/verify-otp', { cookie: challengeCookie, body: { code: wrong } });

    expect(res.ok).toBe(false);
  });
});
