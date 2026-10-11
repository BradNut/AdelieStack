import { PASSWORD_POLICY_RULES, PASSWORD_POLICY_VIOLATION } from '@adelie/shared';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '../auth.config';

const ORIGIN = 'http://localhost:5173';
const COMPLIANT_PASSWORD = 'Correct-horse-9';
const EMAIL = 'policy@example.com';

type Db = Record<string, Record<string, unknown>[]>;

let auth: Auth;
let db: Db;

async function signUp(password: string) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: new Headers({ origin: ORIGIN, 'content-type': 'application/json' }),
      body: JSON.stringify({ name: 'Test User', email: EMAIL, password }),
    }),
  );
}

beforeEach(() => {
  db = { user: [], session: [], account: [], verification: [], twoFactor: [] };
  auth = createAuth({
    database: memoryAdapter(db),
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    twoFactorIssuer: 'AdelieStack',
    passkey: { rpID: 'localhost', rpName: 'AdelieStack', origin: ORIGIN },
    mailer: { send: async () => {} },
  });
});

describe('password policy hook: sign-up', () => {
  it('rejects a weak password with the stable code and the violated rules', async () => {
    const res = await signUp('alllowercase');

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; rules: string[] };
    expect(body.code).toBe(PASSWORD_POLICY_VIOLATION);
    expect(body.rules).toEqual([PASSWORD_POLICY_RULES.UPPERCASE, PASSWORD_POLICY_RULES.DIGIT, PASSWORD_POLICY_RULES.SPECIAL]);
  });

  it('does not create the user when the password is rejected', async () => {
    await signUp('alllowercase');

    const found = await (await auth.$context).internalAdapter.findUserByEmail(EMAIL);
    expect(found).toBeNull();
  });

  it('accepts a compliant password', async () => {
    const res = await signUp(COMPLIANT_PASSWORD);

    expect(res.status).toBe(200);
  });

  it('rejects an over-long password', async () => {
    const res = await signUp(`${COMPLIANT_PASSWORD}${'a'.repeat(200)}`);

    expect(res.status).toBe(400);
  });
});

function post(path: string, body: unknown, cookie?: string) {
  const headers = new Headers({ origin: ORIGIN, 'content-type': 'application/json' });
  if (cookie) headers.set('cookie', cookie);
  return auth.handler(new Request(`${ORIGIN}/api/auth${path}`, { method: 'POST', headers, body: JSON.stringify(body) }));
}

/** Creates a verified user straight through the adapter, bypassing the policy (a pre-existing account). */
async function seedUser(password: string) {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ name: 'Seed', email: EMAIL, emailVerified: true }, { method: 'email-password' });
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
}

async function signInCookie(password: string) {
  const res = await post('/sign-in/email', { email: EMAIL, password });
  expect(res.status).toBe(200);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function resetToken() {
  await post('/request-password-reset', { email: EMAIL, redirectTo: `${ORIGIN}/reset` });
  const row = db.verification.find((v) => String(v.identifier).startsWith('reset-password:'));
  return String(row?.identifier).slice('reset-password:'.length);
}

describe('password policy hook: reset-password', () => {
  it('rejects a weak new password with the stable code and rules', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const token = await resetToken();

    const res = await post('/reset-password', { newPassword: 'alllowercase', token });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; rules: string[] };
    expect(body.code).toBe(PASSWORD_POLICY_VIOLATION);
    expect(body.rules).toEqual([PASSWORD_POLICY_RULES.UPPERCASE, PASSWORD_POLICY_RULES.DIGIT, PASSWORD_POLICY_RULES.SPECIAL]);
  });

  it('accepts a compliant new password', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const token = await resetToken();

    const res = await post('/reset-password', { newPassword: 'Another-pass-7', token });

    expect(res.status).toBe(200);
    await signInCookie('Another-pass-7');
  });
});

describe('password policy hook: change-password', () => {
  it('rejects a weak new password with the stable code and rules', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const cookie = await signInCookie(COMPLIANT_PASSWORD);

    const res = await post('/change-password', { currentPassword: COMPLIANT_PASSWORD, newPassword: 'alllowercase' }, cookie);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; rules: string[] };
    expect(body.code).toBe(PASSWORD_POLICY_VIOLATION);
    expect(body.rules).toEqual([PASSWORD_POLICY_RULES.UPPERCASE, PASSWORD_POLICY_RULES.DIGIT, PASSWORD_POLICY_RULES.SPECIAL]);
  });

  it('accepts a compliant new password', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const cookie = await signInCookie(COMPLIANT_PASSWORD);

    const res = await post('/change-password', { currentPassword: COMPLIANT_PASSWORD, newPassword: 'Another-pass-7' }, cookie);

    expect(res.status).toBe(200);
  });
});

describe('password policy: existing weak passwords', () => {
  it('still lets a user with a weak password sign in', async () => {
    await seedUser('weakpass');

    await signInCookie('weakpass');
  });
});
