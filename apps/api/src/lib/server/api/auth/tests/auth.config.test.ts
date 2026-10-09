import { RoleName } from '@adelie/shared';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Auth, createAuth, generateAuthId } from '../auth.config';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

let auth: Auth;

/** Drives a real Better Auth endpoint through its HTTP handler, as the Hono mount does. */
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

/** Signs up a user and returns the session cookie for follow-up requests. */
async function signUp(email: string, extra: Record<string, unknown> = {}) {
  const res = await call('/sign-up/email', { body: { name: 'Test User', email, password: PASSWORD, ...extra } });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const { user } = (await res.json()) as { user: { id: string; role: string } };
  return { res, cookie, user };
}

async function roleOf(cookie: string) {
  const session = (await (await call('/get-session', { cookie })).json()) as { user: { role: string } };
  return session.user.role;
}

/** Promotes a user the way the seed does: a server-side admin call with no session. */
async function promote(userId: string, role: RoleName) {
  const adapter = (await auth.$context).internalAdapter;
  await adapter.updateUser(userId, { role });
}

beforeEach(() => {
  auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], twoFactor: [] }),
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    twoFactorIssuer: 'AdelieStack',
    mailer: { send: async () => {} },
  });
});

describe('generateAuthId', () => {
  it('returns a uuidv7 for auth table ids', () => {
    expect(generateAuthId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is used for the ids Better Auth writes', async () => {
    const { user } = await signUp('ids@example.com');
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });
});

describe('roles (admin plugin)', () => {
  it('gives a new user the `user` role', async () => {
    const { cookie } = await signUp('new@example.com');

    expect(await roleOf(cookie)).toBe(RoleName.USER);
  });

  it('does not let a user pick their role at sign-up', async () => {
    const { res, cookie } = await signUp('sneaky@example.com', { role: RoleName.ADMIN });

    // Better Auth rejects input on `input: false` fields; either way no admin is created.
    if (res.ok) {
      expect(await roleOf(cookie)).toBe(RoleName.USER);
    } else {
      expect(res.status).toBe(400);
    }
  });

  it('does not let a user change their own role through update-user', async () => {
    const { cookie } = await signUp('self@example.com');

    const res = await call('/update-user', { cookie, body: { role: RoleName.ADMIN } });

    expect(res.ok).toBe(false);
    expect(await roleOf(cookie)).toBe(RoleName.USER);
  });

  it.each([RoleName.USER, RoleName.SUPPORT])('does not let a %s call admin set-role', async (role) => {
    const { cookie, user } = await signUp(`${role}@example.com`);
    await promote(user.id, role);

    const res = await call('/admin/set-role', { cookie, body: { userId: user.id, role: RoleName.ADMIN } });

    expect(res.status).toBe(403);
    expect(await roleOf(cookie)).toBe(role);
  });

  it('lets an admin change another user’s role', async () => {
    const admin = await signUp('admin@example.com');
    await promote(admin.user.id, RoleName.ADMIN);
    const target = await signUp('target@example.com');

    const res = await call('/admin/set-role', { cookie: admin.cookie, body: { userId: target.user.id, role: RoleName.SUPPORT } });

    expect(res.status).toBe(200);
    expect(await roleOf(target.cookie)).toBe(RoleName.SUPPORT);
  });

  it('rejects a role outside admin, support, and user', async () => {
    const admin = await signUp('admin2@example.com');
    await promote(admin.user.id, RoleName.ADMIN);
    const target = await signUp('target2@example.com');

    const res = await call('/admin/set-role', { cookie: admin.cookie, body: { userId: target.user.id, role: 'moderator' } });

    expect(res.ok).toBe(false);
    expect(await roleOf(target.cookie)).toBe(RoleName.USER);
  });

  it('lets support list users but not ban them', async () => {
    const support = await signUp('support@example.com');
    await promote(support.user.id, RoleName.SUPPORT);
    const target = await signUp('target3@example.com');

    const list = await call('/admin/list-users', { cookie: support.cookie });
    const ban = await call('/admin/ban-user', { cookie: support.cookie, body: { userId: target.user.id } });

    expect(list.status).toBe(200);
    expect(ban.status).toBe(403);
  });
});
