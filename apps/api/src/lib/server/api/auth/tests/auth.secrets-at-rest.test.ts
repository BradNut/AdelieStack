import { beforeEach, describe, expect, it } from 'vitest';
import {
  type AuthRequest,
  cookiesFrom,
  emailedOtp,
  resetToken,
  signUpWithEmail,
  signUpWithTotp,
  startTwoFactorSignIn,
  TEST_USER,
} from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const { email: EMAIL } = TEST_USER;
const NEW_PASSWORD = 'another long passphrase';

let t: ReturnType<typeof createTestAuth>;
let request: AuthRequest;

beforeEach(() => {
  t = createTestAuth();
  ({ request } = t);
});

/** Every verification row as stored, joined, so a test can look for a secret anywhere in it. */
function storedVerifications(): string {
  return JSON.stringify(t.db.verification);
}

async function signsIn(password: string) {
  return (await request('/sign-in/email', { body: { email: EMAIL, password } })).status === 200;
}

describe('a password-reset link', () => {
  it('is stored hashed: no verification row holds the emailed token', async () => {
    await signUpWithEmail(request, TEST_USER);

    const token = await resetToken(request, t.mailer.sent);

    expect(token).not.toBe('');
    expect(t.db.verification.length).toBeGreaterThan(0);
    expect(storedVerifications()).not.toContain(token);
  });

  it('still resets the password', async () => {
    await signUpWithEmail(request, TEST_USER);
    const token = await resetToken(request, t.mailer.sent);

    expect((await request('/reset-password', { body: { newPassword: NEW_PASSWORD, token } })).status).toBe(200);

    expect(await signsIn(NEW_PASSWORD)).toBe(true);
  });

  it('issued before hashing (plain identifier) keeps working', async () => {
    await signUpWithEmail(request, TEST_USER);
    const userId = String(t.db.user[0]?.id);
    const token = 'link-issued-before-hashing';
    const now = new Date();
    t.db.verification.push({
      id: 'pre-change-reset',
      identifier: `reset-password:${token}`,
      value: userId,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
    });

    expect((await request('/reset-password', { body: { newPassword: NEW_PASSWORD, token } })).status).toBe(200);

    expect(await signsIn(NEW_PASSWORD)).toBe(true);
  });

  it('a spent plain link cannot be replayed', async () => {
    await signUpWithEmail(request, TEST_USER);
    const userId = String(t.db.user[0]?.id);
    const token = 'link-issued-before-hashing';
    const now = new Date();
    t.db.verification.push({
      id: 'pre-change-reset',
      identifier: `reset-password:${token}`,
      value: userId,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
    });
    await request('/reset-password', { body: { newPassword: NEW_PASSWORD, token } });

    expect((await request('/reset-password', { body: { newPassword: 'yet another long passphrase', token } })).status).toBe(400);
  });
});

describe('an emailed two-factor code', () => {
  async function sendCode() {
    await signUpWithTotp(request, TEST_USER);
    const { challengeCookie } = await startTwoFactorSignIn(request, TEST_USER);
    t.mailer.sent.length = 0;
    await request('/two-factor/send-otp', { cookie: challengeCookie, body: {} });
    const otp = emailedOtp(t.mailer.sent[0]) ?? '';
    expect(otp).toMatch(/^\d{6}$/);
    return { challengeCookie, otp };
  }

  it('is stored hashed: the stored row holds neither the code nor its plain form', async () => {
    const { otp } = await sendCode();

    const row = t.db.verification.find((v) => String(v.value).endsWith(':0'));
    expect(row).toBeDefined();
    expect(String(row?.value)).not.toContain(otp);
  });

  it('still signs in', async () => {
    const { challengeCookie, otp } = await sendCode();

    const res = await request('/two-factor/verify-otp', { cookie: challengeCookie, body: { code: otp } });

    expect(res.status).toBe(200);
    const session = await (await request('/get-session', { cookie: cookiesFrom(res, challengeCookie) })).json();
    expect(session).not.toBeNull();
  });

  it('issued before hashing (plain value) is refused cleanly, and a fresh code then signs in', async () => {
    const { challengeCookie, otp } = await sendCode();
    const row = t.db.verification.find((v) => String(v.value).endsWith(':0'));
    if (row) row.value = `${otp}:0`; // how the code was stored before hashing

    const stale = await request('/two-factor/verify-otp', { cookie: challengeCookie, body: { code: otp } });
    expect(stale.ok).toBe(false);
    expect(stale.status).toBeLessThan(500);

    t.mailer.sent.length = 0;
    await request('/two-factor/send-otp', { cookie: challengeCookie, body: {} });
    const fresh = emailedOtp(t.mailer.sent[0]);
    const res = await request('/two-factor/verify-otp', { cookie: challengeCookie, body: { code: fresh } });
    expect(res.status).toBe(200);
  });
});
