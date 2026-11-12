import { MIN_PASSWORD_LENGTH, PASSWORD_COMPROMISED, PASSWORD_POLICY_RULES, PASSWORD_POLICY_VIOLATION } from '@adelie/shared';
import { hashPassword } from 'better-auth/crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '#lib/server/api/auth/auth.config';
import { createHibpHealth } from '#lib/server/api/auth/auth.hibp-status';
import { type AuthRequest, cookiesFrom, enrolPasskey, resetToken, signUpWithEmail, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';
import { HIBP_HOST, mockHibp, PWNED_PASSWORD, sha1 } from '../../../../../test/mocks/hibp.mock';

const COMPLIANT_PASSWORD = 'correct horse battery';
const OTHER_PASSWORD = 'another long passphrase';
/** One under and exactly at the new-password minimum. */
const UNDER_MIN = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
const AT_MIN = 'x'.repeat(MIN_PASSWORD_LENGTH);
const WEAK = ' short';
const WEAK_RULES = [PASSWORD_POLICY_RULES.MIN_LENGTH, PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE];

const { email: EMAIL } = TEST_USER;

let auth: Auth;
let db: ReturnType<typeof createTestAuth>['db'];
let request: AuthRequest;

afterEach(() => {
  vi.unstubAllGlobals();
});

function buildAuth(enabled = true) {
  ({ auth, db, request } = createTestAuth({ hibpStatus: createHibpHealth({ enabled }) }));
}

beforeEach(() => {
  mockHibp([]);
  buildAuth();
});

describe('password policy hook: sign-up', () => {
  it('rejects a weak password with the stable code and the violated rules', async () => {
    const { res } = await signUpWithEmail(request, { ...TEST_USER, password: WEAK });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; rules: string[] };
    expect(body.code).toBe(PASSWORD_POLICY_VIOLATION);
    expect(body.rules).toEqual(WEAK_RULES);
  });

  it('does not create the user when the password is rejected', async () => {
    await signUpWithEmail(request, { ...TEST_USER, password: WEAK });

    const found = await (await auth.$context).internalAdapter.findUserByEmail(EMAIL);
    expect(found).toBeNull();
  });

  it('accepts a compliant password', async () => {
    const { res } = await signUpWithEmail(request, { ...TEST_USER, password: COMPLIANT_PASSWORD });

    expect(res.status).toBe(200);
  });

  it('rejects one under the minimum with MIN_LENGTH and creates no user', async () => {
    const { res } = await signUpWithEmail(request, { ...TEST_USER, password: UNDER_MIN });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: PASSWORD_POLICY_VIOLATION, rules: [PASSWORD_POLICY_RULES.MIN_LENGTH] });
    expect(await (await auth.$context).internalAdapter.findUserByEmail(EMAIL)).toBeNull();
  });

  it('accepts exactly the minimum', async () => {
    const { res } = await signUpWithEmail(request, { ...TEST_USER, password: AT_MIN });

    expect(res.status).toBe(200);
  });

  it('rejects an over-long password', async () => {
    const { res } = await signUpWithEmail(request, { ...TEST_USER, password: `${COMPLIANT_PASSWORD}${'a'.repeat(200)}` });

    expect(res.status).toBe(400);
  });
});

function post(path: string, body: unknown, cookie?: string) {
  return request(path, { body, cookie });
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
  return cookiesFrom(res);
}

describe('password policy hook: reset-password', () => {
  it('rejects a weak new password with the stable code and rules', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const token = await resetToken(request, db);

    const res = await post('/reset-password', { newPassword: WEAK, token });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; rules: string[] };
    expect(body.code).toBe(PASSWORD_POLICY_VIOLATION);
    expect(body.rules).toEqual(WEAK_RULES);
  });

  it('accepts a compliant new password', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const token = await resetToken(request, db);

    const res = await post('/reset-password', { newPassword: OTHER_PASSWORD, token });

    expect(res.status).toBe(200);
    await signInCookie(OTHER_PASSWORD);
  });

  it('rejects one under the minimum with MIN_LENGTH', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const token = await resetToken(request, db);

    const res = await post('/reset-password', { newPassword: UNDER_MIN, token });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: PASSWORD_POLICY_VIOLATION, rules: [PASSWORD_POLICY_RULES.MIN_LENGTH] });
  });

  it('accepts exactly the minimum', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const token = await resetToken(request, db);

    const res = await post('/reset-password', { newPassword: AT_MIN, token });

    expect(res.status).toBe(200);
    await signInCookie(AT_MIN);
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

  it('rejects one under the minimum with MIN_LENGTH and keeps the old password', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const cookie = await signInCookie(COMPLIANT_PASSWORD);

    const res = await post('/change-password', { currentPassword: COMPLIANT_PASSWORD, newPassword: UNDER_MIN }, cookie);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: PASSWORD_POLICY_VIOLATION, rules: [PASSWORD_POLICY_RULES.MIN_LENGTH] });
    await signInCookie(COMPLIANT_PASSWORD);
  });

  it('accepts exactly the minimum', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const cookie = await signInCookie(COMPLIANT_PASSWORD);

    const res = await post('/change-password', { currentPassword: COMPLIANT_PASSWORD, newPassword: AT_MIN }, cookie);

    expect(res.status).toBe(200);
  });
});

describe('password policy: existing weak passwords', () => {
  it('still lets a user with a weak password sign in', async () => {
    await seedUser('weakpass');

    await signInCookie('weakpass');
  });

  it('still lets a user with a password one under the minimum sign in', async () => {
    await seedUser(UNDER_MIN);

    await signInCookie(UNDER_MIN);
  });
});

describe('password policy hook: admin paths', () => {
  let adminHeaders: Headers;

  beforeEach(async () => {
    const { cookie } = await signUpWithEmail(request, { ...TEST_USER, password: COMPLIANT_PASSWORD });
    const { internalAdapter } = await auth.$context;
    const adminUser = await internalAdapter.findUserByEmail(EMAIL);
    if (!adminUser) throw new Error('admin fixture was not created');
    await internalAdapter.updateUser(adminUser.user.id, { role: 'admin' });
    await enrolPasskey(auth, adminUser.user.id);
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

  it('rejects one under the minimum on create-user and leaves no user row', async () => {
    await expect(adminCreate(UNDER_MIN)).rejects.toMatchObject({
      status: 'BAD_REQUEST',
      body: { code: PASSWORD_POLICY_VIOLATION, rules: [PASSWORD_POLICY_RULES.MIN_LENGTH] },
    });
    expect(await (await auth.$context).internalAdapter.findUserByEmail('admin-created@example.com')).toBeNull();
  });

  it('accepts exactly the minimum on create-user', async () => {
    const res = await adminCreate(AT_MIN);

    expect(res.user.email).toBe('admin-created@example.com');
  });

  it('rejects one under the minimum on set-user-password', async () => {
    const user = await seedUser();

    await expect(auth.api.setUserPassword({ headers: adminHeaders, body: { userId: user.id, newPassword: UNDER_MIN } })).rejects.toMatchObject({
      status: 'BAD_REQUEST',
      body: { code: PASSWORD_POLICY_VIOLATION, rules: [PASSWORD_POLICY_RULES.MIN_LENGTH] },
    });
  });

  it('accepts exactly the minimum on set-user-password', async () => {
    const user = await seedUser();

    const res = await auth.api.setUserPassword({ headers: adminHeaders, body: { userId: user.id, newPassword: AT_MIN } });

    expect(res.status).toBe(true);
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
    await signUpWithEmail(request, { ...TEST_USER, password: COMPLIANT_PASSWORD });
    const { internalAdapter } = await auth.$context;
    const found = await internalAdapter.findUserByEmail(EMAIL);
    if (!found) throw new Error('admin fixture was not created');
    await internalAdapter.updateUser(found.user.id, { role: 'admin' });
    await enrolPasskey(auth, found.user.id);
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
  it.each(['alllowercaseonly', '123456789012345', 'pässwörd-密码-🐧-tux', 'internal spaces are fine'])('accepts %s on sign-up', async (password) => {
    const { res } = await signUpWithEmail(request, { ...TEST_USER, password });

    expect(res.status).toBe(200);
    await signInCookie(password);
  });

  it.each([' leading-space-passphrase', 'trailing-space-passphrase '])(
    'rejects %j with LEADING_OR_TRAILING_SPACE and does not trim it',
    async (password) => {
      const { res } = await signUpWithEmail(request, { ...TEST_USER, password });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string; rules: string[] };
      expect(body).toMatchObject({ code: PASSWORD_POLICY_VIOLATION, rules: [PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE] });
      expect(await (await auth.$context).internalAdapter.findUserByEmail(EMAIL)).toBeNull();
    },
  );
});

describe('breached password screening (haveIBeenPwned, mocked)', () => {
  it('rejects a breached password on sign-up with PASSWORD_COMPROMISED and creates no user', async () => {
    mockHibp([PWNED_PASSWORD]);

    const { res } = await signUpWithEmail(request, { ...TEST_USER, password: PWNED_PASSWORD });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(PASSWORD_COMPROMISED);
    expect(await (await auth.$context).internalAdapter.findUserByEmail(EMAIL)).toBeNull();
  });

  it('sends only the five-character hash prefix (k-anonymity)', async () => {
    const fetchMock = mockHibp([]);

    await signUpWithEmail(request, { ...TEST_USER, password: COMPLIANT_PASSWORD });

    const urls = fetchMock.mock.calls.map(([input]) => String(input instanceof Request ? input.url : input));
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe(`${HIBP_HOST}${sha1(COMPLIANT_PASSWORD).slice(0, 5)}`);
  });

  it('rejects a breached new password on reset-password', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const token = await resetToken(request, db);
    mockHibp([PWNED_PASSWORD]);

    const res = await post('/reset-password', { newPassword: PWNED_PASSWORD, token });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(PASSWORD_COMPROMISED);
  });

  it('keeps the reset link usable after rejecting a breached password', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const token = await resetToken(request, db);
    mockHibp([PWNED_PASSWORD]);

    const rejected = await post('/reset-password', { newPassword: PWNED_PASSWORD, token });
    const accepted = await post('/reset-password', { newPassword: OTHER_PASSWORD, token });

    expect(rejected.status).toBe(400);
    expect(accepted.status).toBe(200);
    await signInCookie(OTHER_PASSWORD);
  });

  it('keeps the reset link usable after an HIBP outage rejects the request', async () => {
    await seedUser(COMPLIANT_PASSWORD);
    const token = await resetToken(request, db);
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
    const token = await resetToken(request, db);
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

    const { res } = await signUpWithEmail(request, { ...TEST_USER, password: WEAK });

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

    const { res } = await signUpWithEmail(request, { ...TEST_USER, password: COMPLIANT_PASSWORD });

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
    await enrolPasskey(auth, found.user.id);
    const headers = new Headers({ cookie: await signInCookie(COMPLIANT_PASSWORD) });
    const fetchMock = mockHibp([PWNED_PASSWORD]);

    const res = await auth.api.setUserPassword({ headers, body: { userId: found.user.id, newPassword: PWNED_PASSWORD } });

    expect(res.status).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a breached password on sign-up without calling HIBP', async () => {
    const fetchMock = mockHibp([PWNED_PASSWORD]);

    const { res } = await signUpWithEmail(request, { ...TEST_USER, password: PWNED_PASSWORD });

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
