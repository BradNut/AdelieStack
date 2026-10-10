import { memoryAdapter } from 'better-auth/adapters/memory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendProps } from '../../mail/interfaces/mailer.interface';
import { type Auth, createAuth, TWO_FACTOR_OTP_PERIOD_MINUTES } from '../auth.config';
import { totpCode } from './totp';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
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

/** Merges Set-Cookie headers into a Cookie header, keeping earlier cookies the response does not replace. */
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

/** Signs up, then enrols TOTP and confirms it with a first code. */
async function signUpWithTotp() {
  const signUp = await call('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } });
  let cookie = cookiesFrom(signUp);
  const enable = await call('/two-factor/enable', { cookie, body: { password: PASSWORD } });
  const { totpURI, backupCodes } = (await enable.json()) as { totpURI: string; backupCodes: string[] };
  const verify = await call('/two-factor/verify-totp', { cookie, body: { code: totpCode(totpURI) } });
  cookie = cookiesFrom(verify, cookie);
  return { totpURI, backupCodes, verify };
}

/** Password sign-in for a 2FA user returns a challenge cookie instead of a session. */
async function startSignIn() {
  const res = await call('/sign-in/email', { body: { email: EMAIL, password: PASSWORD } });
  const json = (await res.json()) as { twoFactorRedirect?: boolean };
  return { challengeCookie: cookiesFrom(res), twoFactorRedirect: json.twoFactorRedirect };
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
    const { totpURI } = await signUpWithTotp();

    const { challengeCookie, twoFactorRedirect } = await startSignIn();
    expect(twoFactorRedirect).toBe(true);
    expect(await hasSession(challengeCookie)).toBe(false);

    const res = await call('/two-factor/verify-totp', { cookie: challengeCookie, body: { code: totpCode(totpURI) } });

    expect(res.status).toBe(200);
    expect(await hasSession(cookiesFrom(res, challengeCookie))).toBe(true);
  });

  it('rejects a wrong code', async () => {
    const { totpURI } = await signUpWithTotp();
    const { challengeCookie } = await startSignIn();
    const wrong = totpCode(totpURI) === '000000' ? '111111' : '000000';

    const res = await call('/two-factor/verify-totp', { cookie: challengeCookie, body: { code: wrong } });

    expect(res.ok).toBe(false);
    expect(await hasSession(cookiesFrom(res, challengeCookie))).toBe(false);
  });

  it('rejects an expired code', async () => {
    const { totpURI } = await signUpWithTotp();
    const { challengeCookie } = await startSignIn();

    const res = await call('/two-factor/verify-totp', { cookie: challengeCookie, body: { code: totpCode(totpURI, -10) } });

    expect(res.ok).toBe(false);
  });
});

describe('sign-in with a recovery code', () => {
  it('signs in with a recovery code once, and rejects the same code afterwards', async () => {
    const { backupCodes } = await signUpWithTotp();
    const [code] = backupCodes;

    const first = await startSignIn();
    const used = await call('/two-factor/verify-backup-code', { cookie: first.challengeCookie, body: { code } });
    expect(used.status).toBe(200);
    expect(await hasSession(cookiesFrom(used, first.challengeCookie))).toBe(true);

    const second = await startSignIn();
    const reused = await call('/two-factor/verify-backup-code', { cookie: second.challengeCookie, body: { code } });
    expect(reused.ok).toBe(false);
    expect(await hasSession(cookiesFrom(reused, second.challengeCookie))).toBe(false);
  });

  it('rejects a code that was never issued', async () => {
    await signUpWithTotp();
    const { challengeCookie } = await startSignIn();

    const res = await call('/two-factor/verify-backup-code', { cookie: challengeCookie, body: { code: 'aaaaa-bbbbb' } });

    expect(res.ok).toBe(false);
  });
});

describe('sign-in with an emailed OTP', () => {
  it('emails the code through the mailer and signs in with it', async () => {
    await signUpWithTotp();
    const { challengeCookie } = await startSignIn();
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
    await signUpWithTotp();
    const { challengeCookie } = await startSignIn();
    await call('/two-factor/send-otp', { cookie: challengeCookie, body: {} });
    const otp = send.mock.calls[0][0].template.html().match(/token-text'>(\d+)</)?.[1] ?? '';
    const wrong = otp === '000000' ? '111111' : '000000';

    const res = await call('/two-factor/verify-otp', { cookie: challengeCookie, body: { code: wrong } });

    expect(res.ok).toBe(false);
  });
});
