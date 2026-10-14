import { createHash } from 'node:crypto';
import { PASSWORD_COMPROMISED, PASSWORD_POLICY_RULES, PASSWORD_POLICY_VIOLATION } from '@adelie/shared';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { hashPassword } from 'better-auth/crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Auth, createAuth } from '#lib/server/api/auth/auth.config';

const ORIGIN = 'http://localhost:5173';
const COMPLIANT_PASSWORD = 'correct horse battery';
const OTHER_PASSWORD = 'another long passphrase';
const PWNED_PASSWORD = 'password12345';
const HIBP_HOST = 'https://api.pwnedpasswords.com/range/';
const WEAK = ' short';
const WEAK_RULES = [PASSWORD_POLICY_RULES.MIN_LENGTH, PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE];

const sha1 = (value: string) => createHash('sha1').update(value).digest('hex').toUpperCase();

/** Mocks the HIBP range API (no real network): `pwned` passwords are reported with a count, everything else is clean. */
function mockHibp(pwned: string[], failWith?: number) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(HIBP_HOST)) throw new Error(`unexpected network call: ${url}`);
    if (failWith) return new Response('nope', { status: failWith });
    const prefix = url.slice(HIBP_HOST.length);
    const lines = pwned
      .map(sha1)
      .filter((hash) => hash.startsWith(prefix))
      .map((hash) => `${hash.slice(5)}:42`);
    return new Response(['0000000000000000000000000000000000A:0', ...lines].join('\r\n'), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
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

afterEach(() => {
  vi.unstubAllGlobals();
});

function buildAuth(hibpEnabled = true) {
  db = { user: [], session: [], account: [], verification: [], twoFactor: [] };
  auth = createAuth({
    database: memoryAdapter(db),
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    twoFactorIssuer: 'AdelieStack',
    passkey: { rpID: 'localhost', rpName: 'AdelieStack', origin: ORIGIN },
    mailer: { send: async () => {} },
    signUpEnabled: true,
    hibpEnabled,
  });
}

beforeEach(() => {
  mockHibp([]);
  buildAuth();
});

describe('password policy hook: sign-up', () => {
  it('rejects a weak password with the stable code and the violated rules', async () => {
    const res = await signUp(WEAK);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; rules: string[] };
    expect(body.code).toBe(PASSWORD_POLICY_VIOLATION);
    expect(body.rules).toEqual(WEAK_RULES);
  });

  it('does not create the user when the password is rejected', async () => {
    await signUp(WEAK);

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
    password: await hashPassword(password),
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

    const res = await post('/reset-password', { newPassword: WEAK, token });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; rules: string[] };
    expect(body.code).toBe(PASSWORD_POLICY_VIOLATION);
    expect(body.rules).toEqual(WEAK_RULES);
  });

  it('accepts a compliant new password', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const token = await resetToken();

    const res = await post('/reset-password', { newPassword: OTHER_PASSWORD, token });

    expect(res.status).toBe(200);
    await signInCookie(OTHER_PASSWORD);
  });
});

describe('password policy hook: change-password', () => {
  it('rejects a weak new password with the stable code and rules', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const cookie = await signInCookie(COMPLIANT_PASSWORD);

    const res = await post('/change-password', { currentPassword: COMPLIANT_PASSWORD, newPassword: WEAK }, cookie);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; rules: string[] };
    expect(body.code).toBe(PASSWORD_POLICY_VIOLATION);
    expect(body.rules).toEqual(WEAK_RULES);
  });

  it('accepts a compliant new password', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const cookie = await signInCookie(COMPLIANT_PASSWORD);

    const res = await post('/change-password', { currentPassword: COMPLIANT_PASSWORD, newPassword: OTHER_PASSWORD }, cookie);

    expect(res.status).toBe(200);
  });
});

describe('password policy: existing weak passwords', () => {
  it('still lets a user with a weak password sign in', async () => {
    await seedUser('weakpass');

    await signInCookie('weakpass');
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
    await expect(adminCreate('short')).rejects.toMatchObject({
      status: 'BAD_REQUEST',
      body: { code: PASSWORD_POLICY_VIOLATION, rules: [PASSWORD_POLICY_RULES.MIN_LENGTH] },
    });
    expect(await (await auth.$context).internalAdapter.findUserByEmail('admin-created@example.com')).toBeNull();
  });

  it('rejects a weak password on create-user with the violated rules', async () => {
    await expect(adminCreate(WEAK)).rejects.toMatchObject({
      body: {
        code: PASSWORD_POLICY_VIOLATION,
        rules: WEAK_RULES,
      },
    });
  });

  it('accepts a compliant password on create-user', async () => {
    const res = await adminCreate(COMPLIANT_PASSWORD);

    expect(res.user.email).toBe('admin-created@example.com');
  });

  it('rejects a weak password on set-user-password with the stable code and rules', async () => {
    const user = await seedUser();

    await expect(auth.api.setUserPassword({ headers: adminHeaders, body: { userId: user.id, newPassword: WEAK } })).rejects.toMatchObject({
      status: 'BAD_REQUEST',
      body: {
        code: PASSWORD_POLICY_VIOLATION,
        rules: WEAK_RULES,
      },
    });
  });

  it('accepts a compliant password on set-user-password', async () => {
    const user = await seedUser();

    const res = await auth.api.setUserPassword({ headers: adminHeaders, body: { userId: user.id, newPassword: OTHER_PASSWORD } });

    expect(res.status).toBe(true);
  });

  it('rejects a breached password on create-user', async () => {
    mockHibp([PWNED_PASSWORD]);

    await expect(adminCreate(PWNED_PASSWORD)).rejects.toMatchObject({ status: 'BAD_REQUEST', body: { code: PASSWORD_COMPROMISED } });
    expect(await (await auth.$context).internalAdapter.findUserByEmail('admin-created@example.com')).toBeNull();
  });

  it('fails closed on create-user when HIBP is unavailable and leaves no user row', async () => {
    mockHibp([], 503);

    await expect(adminCreate(OTHER_PASSWORD)).rejects.toMatchObject({ status: 'SERVICE_UNAVAILABLE' });
    expect(await (await auth.$context).internalAdapter.findUserByEmail('admin-created@example.com')).toBeNull();
  });

  it('does not call HIBP on create-user when the switch is off', async () => {
    const fetchMock = mockHibp([PWNED_PASSWORD]);
    buildAuth(false);
    await signUp(COMPLIANT_PASSWORD);
    const { internalAdapter } = await auth.$context;
    const found = await internalAdapter.findUserByEmail(EMAIL);
    if (!found) throw new Error('admin fixture was not created');
    await internalAdapter.updateUser(found.user.id, { role: 'admin' });
    const headers = new Headers({ cookie: await signInCookie(COMPLIANT_PASSWORD) });

    const res = await auth.api.createUser({ headers, body: { email: 'off@example.com', name: 'Off', password: PWNED_PASSWORD, role: 'user' } });

    expect(res.user.email).toBe('off@example.com');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed on set-user-password when HIBP is unavailable', async () => {
    const user = await seedUser();
    mockHibp([], 503);

    await expect(auth.api.setUserPassword({ headers: adminHeaders, body: { userId: user.id, newPassword: OTHER_PASSWORD } })).rejects.toMatchObject({
      status: 'SERVICE_UNAVAILABLE',
    });
  });

  it('rejects a breached password on set-user-password', async () => {
    const user = await seedUser();
    mockHibp([PWNED_PASSWORD]);

    await expect(auth.api.setUserPassword({ headers: adminHeaders, body: { userId: user.id, newPassword: PWNED_PASSWORD } })).rejects.toMatchObject({
      status: 'BAD_REQUEST',
      body: { code: PASSWORD_COMPROMISED },
    });
  });
});

describe('password policy: no composition rules, no input mutation', () => {
  it.each(['alllowercase', '12345678', 'pässwörd-密码-🐧', 'internal spaces are fine'])('accepts %s on sign-up', async (password) => {
    const res = await signUp(password);

    expect(res.status).toBe(200);
    await signInCookie(password);
  });

  it.each([' leading-space-pass', 'trailing-space-pass '])('rejects %j with LEADING_OR_TRAILING_SPACE and does not trim it', async (password) => {
    const res = await signUp(password);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; rules: string[] };
    expect(body).toMatchObject({ code: PASSWORD_POLICY_VIOLATION, rules: [PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE] });
    expect(await (await auth.$context).internalAdapter.findUserByEmail(EMAIL)).toBeNull();
  });
});

describe('breached password screening (haveIBeenPwned, mocked)', () => {
  it('rejects a breached password on sign-up with PASSWORD_COMPROMISED and creates no user', async () => {
    mockHibp([PWNED_PASSWORD]);

    const res = await signUp(PWNED_PASSWORD);

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(PASSWORD_COMPROMISED);
    expect(await (await auth.$context).internalAdapter.findUserByEmail(EMAIL)).toBeNull();
  });

  it('sends only the five-character hash prefix (k-anonymity)', async () => {
    const fetchMock = mockHibp([]);

    await signUp(COMPLIANT_PASSWORD);

    const urls = fetchMock.mock.calls.map(([input]) => String(input instanceof Request ? input.url : input));
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe(`${HIBP_HOST}${sha1(COMPLIANT_PASSWORD).slice(0, 5)}`);
  });

  it('rejects a breached new password on reset-password', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const token = await resetToken();
    mockHibp([PWNED_PASSWORD]);

    const res = await post('/reset-password', { newPassword: PWNED_PASSWORD, token });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(PASSWORD_COMPROMISED);
  });

  it('keeps the reset link usable after rejecting a breached password', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const token = await resetToken();
    mockHibp([PWNED_PASSWORD]);

    const rejected = await post('/reset-password', { newPassword: PWNED_PASSWORD, token });
    const accepted = await post('/reset-password', { newPassword: OTHER_PASSWORD, token });

    expect(rejected.status).toBe(400);
    expect(accepted.status).toBe(200);
    await signInCookie(OTHER_PASSWORD);
  });

  it('keeps the reset link usable after an HIBP outage rejects the request', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const token = await resetToken();
    mockHibp([], 503);

    const rejected = await post('/reset-password', { newPassword: OTHER_PASSWORD, token });
    mockHibp([]);
    const accepted = await post('/reset-password', { newPassword: OTHER_PASSWORD, token });

    expect(rejected.status).toBe(503);
    expect(accepted.status).toBe(200);
  });

  it('does not call HIBP on reset-password when the switch is off', async () => {
    buildAuth(false);
    await seedUser(COMPLIANT_PASSWORD);
    const token = await resetToken();
    const fetchMock = mockHibp([PWNED_PASSWORD]);

    const res = await post('/reset-password', { newPassword: PWNED_PASSWORD, token });

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a breached new password on change-password', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const cookie = await signInCookie(COMPLIANT_PASSWORD);
    mockHibp([PWNED_PASSWORD]);

    const res = await post('/change-password', { currentPassword: COMPLIANT_PASSWORD, newPassword: PWNED_PASSWORD }, cookie);

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(PASSWORD_COMPROMISED);
  });

  it('reports policy violations first and does not call HIBP for them', async () => {
    const fetchMock = mockHibp([WEAK]);

    const res = await signUp(WEAK);

    expect(((await res.json()) as { code: string }).code).toBe(PASSWORD_POLICY_VIOLATION);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not block sign-in with an already breached password', async () => {
    await seedUser(PWNED_PASSWORD);
    const fetchMock = mockHibp([PWNED_PASSWORD]);

    await signInCookie(PWNED_PASSWORD);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed on sign-up when HIBP is unavailable and creates no user', async () => {
    mockHibp([], 503);

    const res = await signUp(COMPLIANT_PASSWORD);

    expect(res.status).toBe(503);
    expect(await (await auth.$context).internalAdapter.findUserByEmail(EMAIL)).toBeNull();
  });

  it('fails closed on change-password when HIBP is unavailable and keeps the old password', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const cookie = await signInCookie(COMPLIANT_PASSWORD);
    mockHibp([], 503);

    const res = await post('/change-password', { currentPassword: COMPLIANT_PASSWORD, newPassword: OTHER_PASSWORD }, cookie);

    expect(res.status).toBe(503);
    mockHibp([]);
    await signInCookie(COMPLIANT_PASSWORD);
  });
});

describe('breached password screening switched off', () => {
  beforeEach(() => buildAuth(false));

  it('accepts a breached password on admin set-user-password without calling HIBP', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const { internalAdapter } = await auth.$context;
    const found = await internalAdapter.findUserByEmail(EMAIL);
    if (!found) throw new Error('fixture user missing');
    await internalAdapter.updateUser(found.user.id, { role: 'admin' });
    const headers = new Headers({ cookie: await signInCookie(COMPLIANT_PASSWORD) });
    const fetchMock = mockHibp([PWNED_PASSWORD]);

    const res = await auth.api.setUserPassword({ headers, body: { userId: found.user.id, newPassword: PWNED_PASSWORD } });

    expect(res.status).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a breached password on sign-up without calling HIBP', async () => {
    const fetchMock = mockHibp([PWNED_PASSWORD]);

    const res = await signUp(PWNED_PASSWORD);

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a breached password on change-password without calling HIBP', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const cookie = await signInCookie(COMPLIANT_PASSWORD);
    const fetchMock = mockHibp([PWNED_PASSWORD]);

    const res = await post('/change-password', { currentPassword: COMPLIANT_PASSWORD, newPassword: PWNED_PASSWORD }, cookie);

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
