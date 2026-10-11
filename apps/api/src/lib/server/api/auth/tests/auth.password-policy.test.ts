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
