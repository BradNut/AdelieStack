import { getTableConfig } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { accounts, passkeys, sessions, twoFactors } from '#lib/server/api/databases/postgres/drizzle-schema';
import { type AuthRequest, cookiesFrom } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const PASSWORD = 'Correct-horse-9';
const EMAIL = 'penguin@example.com';

let request: AuthRequest;

async function signUp() {
  const res = await request('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } });
  return cookiesFrom(res);
}

const signInStatus = async (password = PASSWORD) => (await request('/sign-in/email', { body: { email: EMAIL, password } })).status;
const sessionUser = async (cookie: string) => ((await (await request('/get-session', { cookie })).json()) as { user?: unknown } | null)?.user;

beforeEach(() => {
  ({ request } = createTestAuth());
});

describe('delete account', () => {
  it('deletes the account when the password is right', async () => {
    const cookie = await signUp();

    const res = await request('/delete-user', { cookie, body: { password: PASSWORD } });

    expect(res.status).toBe(200);
    expect(await sessionUser(cookie)).toBeFalsy();
    expect(await signInStatus()).not.toBe(200);
  });

  it('deletes nothing when the password is wrong', async () => {
    const cookie = await signUp();

    const res = await request('/delete-user', { cookie, body: { password: 'not-the-password' } });

    expect(res.status).toBe(400);
    expect(await sessionUser(cookie)).toBeTruthy();
    expect(await signInStatus()).toBe(200);
  });

  it('refuses a signed-out request', async () => {
    await signUp();

    const res = await request('/delete-user', { body: { password: PASSWORD } });

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
