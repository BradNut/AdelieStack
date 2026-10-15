import { LAST_LOGIN_METHOD_COOKIE, LoginMethod } from '@adelie/shared';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Auth, createAuth } from '#lib/server/api/auth/auth.config';
import type { SendProps } from '#lib/server/api/mail/interfaces/mailer.interface';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Correct-horse-9';
const EMAIL = 'penguin@example.com';

let auth: Auth;
const send = vi.fn<(data: SendProps) => Promise<void>>();

async function post(path: string, body: unknown) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

/** The last-login-method cookie a response sets, or undefined when it sets none. */
function lastLoginCookie(res: Response): string | undefined {
  const header = res.headers.getSetCookie().find((c) => c.startsWith(`${LAST_LOGIN_METHOD_COOKIE}=`));
  return header?.split(';')[0]?.slice(LAST_LOGIN_METHOD_COOKIE.length + 1);
}

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue();
  auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], twoFactor: [], passkey: [] }),
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    twoFactorIssuer: 'AdelieStack',
    passkey: { rpID: 'example.com', rpName: 'Acme Penguins', origin: ORIGIN },
    mailer: { send },
    signUpEnabled: true,
  });
});

describe('last login method cookie', () => {
  it('records password sign-in', async () => {
    await post('/sign-up/email', { name: 'Penguin', email: EMAIL, password: PASSWORD });

    const res = await post('/sign-in/email', { email: EMAIL, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(lastLoginCookie(res)).toBe(LoginMethod.PASSWORD);
  });

  it('is readable by the browser and lives beyond the session', async () => {
    const res = await post('/sign-up/email', { name: 'Penguin', email: EMAIL, password: PASSWORD });

    const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${LAST_LOGIN_METHOD_COOKIE}=`));

    expect(cookie).toBeDefined();
    expect(cookie).not.toMatch(/httponly/i);
    expect(cookie).toMatch(/max-age=\d+/i);
  });

  it('sets nothing when the sign-in fails', async () => {
    await post('/sign-up/email', { name: 'Penguin', email: EMAIL, password: PASSWORD });

    const res = await post('/sign-in/email', { email: EMAIL, password: 'Wrong-horse-9!' });

    expect(res.status).toBe(401);
    expect(lastLoginCookie(res)).toBeUndefined();
  });

  it('stores nothing on the user row (no schema change)', () => {
    expect(auth.options.plugins.find((p) => p.id === 'last-login-method')?.schema).toBeUndefined();
  });
});
