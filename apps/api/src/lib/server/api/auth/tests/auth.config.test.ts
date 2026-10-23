import { RoleName } from '@adelie/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Auth, generateAuthId } from '#lib/server/api/auth/auth.config';
import { type AuthRequest, cookiesFrom } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const PASSWORD = 'Correct-horse-9';

let auth: Auth;
let request: AuthRequest;

/** Signs up a user and returns the session cookie for follow-up requests. */
async function signUp(email: string, extra: Record<string, unknown> = {}) {
  const res = await request('/sign-up/email', { body: { name: 'Test User', email, password: PASSWORD, ...extra } });
  const cookie = cookiesFrom(res);
  const { user } = (await res.json()) as { user: { id: string; role: string } };
  return { res, cookie, user };
}

async function roleOf(cookie: string) {
  const session = (await (await request('/get-session', { cookie })).json()) as { user: { role: string } };
  return session.user.role;
}

/** Promotes a user the way the seed does: a server-side admin call with no session. */
async function promote(userId: string, role: RoleName) {
  const adapter = (await auth.$context).internalAdapter;
  await adapter.updateUser(userId, { role });
}

beforeEach(() => {
  ({ auth, request } = createTestAuth());
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

    const res = await request('/update-user', { cookie, body: { role: RoleName.ADMIN } });

    expect(res.ok).toBe(false);
    expect(await roleOf(cookie)).toBe(RoleName.USER);
  });

  it.each([RoleName.USER, RoleName.SUPPORT])('does not let a %s call admin set-role', async (role) => {
    const { cookie, user } = await signUp(`${role}@example.com`);
    await promote(user.id, role);

    const res = await request('/admin/set-role', { cookie, body: { userId: user.id, role: RoleName.ADMIN } });

    expect(res.status).toBe(403);
    expect(await roleOf(cookie)).toBe(role);
  });

  it('lets an admin change another user’s role', async () => {
    const admin = await signUp('admin@example.com');
    await promote(admin.user.id, RoleName.ADMIN);
    const target = await signUp('target@example.com');

    const res = await request('/admin/set-role', { cookie: admin.cookie, body: { userId: target.user.id, role: RoleName.SUPPORT } });

    expect(res.status).toBe(200);
    expect(await roleOf(target.cookie)).toBe(RoleName.SUPPORT);
  });

  it('rejects a role outside admin, support, and user', async () => {
    const admin = await signUp('admin2@example.com');
    await promote(admin.user.id, RoleName.ADMIN);
    const target = await signUp('target2@example.com');

    const res = await request('/admin/set-role', { cookie: admin.cookie, body: { userId: target.user.id, role: 'moderator' } });

    expect(res.ok).toBe(false);
    expect(await roleOf(target.cookie)).toBe(RoleName.USER);
  });
});

describe('admin plugin endpoints by role', () => {
  const TARGET_ID = 'target-id';
  const endpoints: { name: string; path: string; body?: Record<string, unknown> }[] = [
    { name: 'list-users', path: '/admin/list-users' },
    { name: 'get-user', path: `/admin/get-user?id=${TARGET_ID}` },
    { name: 'list-user-sessions', path: '/admin/list-user-sessions', body: { userId: TARGET_ID } },
    { name: 'revoke-user-session', path: '/admin/revoke-user-session', body: { sessionToken: 'x' } },
    { name: 'revoke-user-sessions', path: '/admin/revoke-user-sessions', body: { userId: TARGET_ID } },
    { name: 'ban-user', path: '/admin/ban-user', body: { userId: TARGET_ID } },
  ];

  async function signedInAs(role: RoleName | null) {
    if (role === null) return undefined;
    const { cookie, user } = await signUp(`${role}-endpoints@example.com`);
    await promote(user.id, role);
    return cookie;
  }

  it.each(endpoints)('forbids support from $name', async ({ path, body }) => {
    const cookie = await signedInAs(RoleName.SUPPORT);
    expect((await request(path, { cookie, body })).status).toBe(403);
  });

  it.each(endpoints)('forbids a user from $name', async ({ path, body }) => {
    const cookie = await signedInAs(RoleName.USER);
    expect((await request(path, { cookie, body })).status).toBe(403);
  });

  it.each(endpoints)('rejects a signed-out request to $name', async ({ path, body }) => {
    expect((await request(path, { body })).status).toBe(401);
  });

  it.each(endpoints)('lets an admin past the permission check for $name', async ({ path, body }) => {
    const cookie = await signedInAs(RoleName.ADMIN);
    const { status } = await request(path, { cookie, body });
    expect(status).not.toBe(401);
    expect(status).not.toBe(403);
  });
});
