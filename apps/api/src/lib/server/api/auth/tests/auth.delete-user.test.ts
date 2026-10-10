import { memoryAdapter } from 'better-auth/adapters/memory';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { accounts, passkeys, sessions, twoFactors } from '../../databases/postgres/drizzle-schema';
import { type Auth, createAuth } from '../auth.config';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const EMAIL = 'penguin@example.com';

let auth: Auth;

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

async function signUp() {
  const res = await call('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } });
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

const signInStatus = async (password = PASSWORD) => (await call('/sign-in/email', { body: { email: EMAIL, password } })).status;
const sessionUser = async (cookie: string) => ((await (await call('/get-session', { cookie })).json()) as { user?: unknown } | null)?.user;

beforeEach(() => {
  auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], twoFactor: [] }),
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    twoFactorIssuer: 'AdelieStack',
    passkey: { rpID: 'localhost', rpName: 'AdelieStack', origin: ORIGIN },
    mailer: { send: async () => {} },
  });
});

describe('delete account', () => {
  it('deletes the account when the password is right', async () => {
    const cookie = await signUp();

    const res = await call('/delete-user', { cookie, body: { password: PASSWORD } });

    expect(res.status).toBe(200);
    expect(await sessionUser(cookie)).toBeFalsy();
    expect(await signInStatus()).not.toBe(200);
  });

  it('deletes nothing when the password is wrong', async () => {
    const cookie = await signUp();

    const res = await call('/delete-user', { cookie, body: { password: 'not-the-password' } });

    expect(res.status).toBe(400);
    expect(await sessionUser(cookie)).toBeTruthy();
    expect(await signInStatus()).toBe(200);
  });

  it('refuses a signed-out request', async () => {
    await signUp();

    const res = await call('/delete-user', { body: { password: PASSWORD } });

    expect(res.status).toBe(401);
    expect(await signInStatus()).toBe(200);
  });
});

describe('what goes with a deleted account', () => {
  it.each([
    ['sessions', sessions],
    ['accounts', accounts],
    ['two_factors', twoFactors],
    ['passkeys', passkeys],
  ])('cascades the %s rows in the database', (_name, table) => {
    const { foreignKeys } = getTableConfig(table);

    expect(foreignKeys.map((fk) => fk.onDelete)).toEqual(['cascade']);
  });
});
