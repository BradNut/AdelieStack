import { PASSWORD_POLICY_RULES, PASSWORD_POLICY_VIOLATION } from '@adelie/shared';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '../auth.config';

const ORIGIN = 'http://localhost:5173';
const COMPLIANT_PASSWORD = 'Correct-horse-9';
const EMAIL = 'policy@example.com';

let auth: Auth;

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

describe('password policy hook: admin paths', () => {
  let adminHeaders: Headers;

  beforeEach(async () => {
    const signUpRes = await signUp(COMPLIANT_PASSWORD);
    const { internalAdapter } = await auth.$context;
    const adminUser = await internalAdapter.findUserByEmail(EMAIL);
    if (!adminUser) throw new Error('admin fixture was not created');
    await internalAdapter.updateUser(adminUser.user.id, { role: 'admin' });
    const cookie = signUpRes.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    adminHeaders = new Headers({ cookie });
  });

  const adminCreate = (password: string) =>
    auth.api.createUser({
      headers: adminHeaders,
      body: { email: 'admin-created@example.com', name: 'Created', password, role: 'user' },
    });

  async function seedUser() {
    const res = await auth.api.createUser({
      headers: adminHeaders,
      body: { email: 'target@example.com', name: 'Target', password: COMPLIANT_PASSWORD, role: 'user' },
    });
    return res.user;
  }

  it('rejects a too-short password on create-user with the stable code', async () => {
    await expect(adminCreate('Aa1!')).rejects.toMatchObject({
      status: 'BAD_REQUEST',
      body: { code: PASSWORD_POLICY_VIOLATION, rules: [PASSWORD_POLICY_RULES.MIN_LENGTH] },
    });
    expect(await (await auth.$context).internalAdapter.findUserByEmail('admin-created@example.com')).toBeNull();
  });

  it('rejects a weak password on create-user with the violated rules', async () => {
    await expect(adminCreate('alllowercase')).rejects.toMatchObject({
      body: {
        code: PASSWORD_POLICY_VIOLATION,
        rules: [PASSWORD_POLICY_RULES.UPPERCASE, PASSWORD_POLICY_RULES.DIGIT, PASSWORD_POLICY_RULES.SPECIAL],
      },
    });
  });

  it('accepts a compliant password on create-user', async () => {
    const res = await adminCreate(COMPLIANT_PASSWORD);

    expect(res.user.email).toBe('admin-created@example.com');
  });

  it('rejects a weak password on set-user-password with the stable code and rules', async () => {
    const user = await seedUser();

    await expect(auth.api.setUserPassword({ headers: adminHeaders, body: { userId: user.id, newPassword: 'alllowercase' } })).rejects.toMatchObject({
      status: 'BAD_REQUEST',
      body: {
        code: PASSWORD_POLICY_VIOLATION,
        rules: [PASSWORD_POLICY_RULES.UPPERCASE, PASSWORD_POLICY_RULES.DIGIT, PASSWORD_POLICY_RULES.SPECIAL],
      },
    });
  });

  it('accepts a compliant password on set-user-password', async () => {
    const user = await seedUser();

    const res = await auth.api.setUserPassword({ headers: adminHeaders, body: { userId: user.id, newPassword: 'Another-pass-7' } });

    expect(res.status).toBe(true);
  });
});
