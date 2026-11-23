import { AUTH_SESSION_FRESH_AGE, AuthErrorCode, RoleName } from '@adelie/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { FRESH_SESSION_ADMIN_PATHS } from '#lib/server/api/auth/auth.fresh-session';
import type { SendProps } from '#lib/server/api/mail/interfaces/mailer.interface';
import { type AuthRequest, ageSessions, cookiesFrom, enrolPasskey, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const { password: PASSWORD } = TEST_USER;
const ADMIN_EMAIL = 'admin@example.com';
const TARGET_EMAIL = 'target@example.com';
/** A session age just past the fresh age, so the session is stale. */
const STALE_AGE = AUTH_SESSION_FRESH_AGE + 60;

let t: ReturnType<typeof createTestAuth>;
let request: AuthRequest;
let sent: SendProps[];
let targetId: string;

beforeEach(async () => {
  t = createTestAuth();
  ({
    request,
    mailer: { sent },
  } = t);
  const { user: admin } = await t.auth.api.createUser({ body: { name: 'Admin', email: ADMIN_EMAIL, password: PASSWORD, role: RoleName.ADMIN } });
  // Admin capabilities need a Second Factor (ADR 0014).
  await enrolPasskey(t.auth, admin.id);
  const { user: target } = await t.auth.api.createUser({ body: { name: 'Target', email: TARGET_EMAIL, password: PASSWORD, role: RoleName.USER } });
  targetId = target.id;
});

async function signIn(email: string) {
  const res = await request('/sign-in/email', { body: { email, password: PASSWORD } });
  expect(res.status).toBe(200);
  return cookiesFrom(res);
}

async function codeOf(res: Response) {
  return ((await res.json()) as { code?: string }).code;
}

function target() {
  return t.db.user.find((user) => user.id === targetId);
}

/** Each guarded admin action, as a request against the target user. */
const GUARDED: { path: string; body: () => Record<string, unknown> }[] = [
  { path: '/admin/create-user', body: () => ({ name: 'New', email: 'new@example.com', password: PASSWORD, role: RoleName.USER }) },
  { path: '/admin/update-user', body: () => ({ userId: targetId, data: { name: 'Renamed' } }) },
  { path: '/admin/set-role', body: () => ({ userId: targetId, role: RoleName.SUPPORT }) },
  { path: '/admin/set-user-password', body: () => ({ userId: targetId, newPassword: 'Another-horse-9' }) },
  { path: '/admin/ban-user', body: () => ({ userId: targetId }) },
  { path: '/admin/unban-user', body: () => ({ userId: targetId }) },
  { path: '/admin/remove-user', body: () => ({ userId: targetId }) },
  { path: '/admin/impersonate-user', body: () => ({ userId: targetId }) },
  { path: '/admin/revoke-user-session', body: () => ({ sessionToken: targetSessionToken() }) },
  { path: '/admin/revoke-user-sessions', body: () => ({ userId: targetId }) },
];

/** Admin endpoints an older session may still use: they read, or end an impersonation. */
const NO_FRESH_SESSION_NEEDED = [
  '/admin/get-user',
  '/admin/list-users',
  '/admin/list-user-sessions',
  '/admin/has-permission',
  '/admin/stop-impersonating',
];

/** Every admin endpoint the auth instance serves. */
function registeredAdminPaths() {
  const paths = Object.values(t.auth.api as Record<string, { path?: string }>).map((endpoint) => endpoint.path);
  return [...new Set(paths.filter((path): path is string => typeof path === 'string' && path.startsWith('/admin/')))].sort();
}

function targetSessionToken() {
  return t.db.session.find((session) => session.userId === targetId)?.token;
}

/** What a refused admin action must leave as it was: the users, their accounts and sessions. */
function snapshot() {
  return structuredClone({ user: t.db.user, account: t.db.account, session: t.db.session });
}

describe('admin endpoint coverage', () => {
  it('classifies every admin endpoint, so a new one cannot skip the fresh-session rule unnoticed', () => {
    expect([...FRESH_SESSION_ADMIN_PATHS, ...NO_FRESH_SESSION_NEEDED].sort()).toEqual(registeredAdminPaths());
  });

  it('tests every guarded endpoint', () => {
    expect(GUARDED.map(({ path }) => path).sort()).toEqual([...FRESH_SESSION_ADMIN_PATHS].sort());
  });
});

describe('admin actions that change a user', () => {
  it.each(GUARDED)('refuses $path from a stale admin session, changing nothing and sending nothing', async ({ path, body }) => {
    await signIn(TARGET_EMAIL);
    const cookie = await signIn(ADMIN_EMAIL);
    ageSessions(t.db, STALE_AGE);
    const before = snapshot();

    const res = await request(path, { cookie, body: body() });

    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe(AuthErrorCode.SESSION_NOT_FRESH);
    expect(snapshot()).toEqual(before);
    expect(sent).toHaveLength(0);
  });

  it.each(GUARDED)('runs $path from a fresh admin session', async ({ path, body }) => {
    await signIn(TARGET_EMAIL);
    const cookie = await signIn(ADMIN_EMAIL);

    const res = await request(path, { cookie, body: body() });

    expect(res.status).toBe(200);
  });

  it('runs an action after a stale admin signs in again', async () => {
    await signIn(ADMIN_EMAIL);
    ageSessions(t.db, STALE_AGE);
    const cookie = await signIn(ADMIN_EMAIL);

    const res = await request('/admin/set-role', { cookie, body: { userId: targetId, role: RoleName.SUPPORT } });

    expect(res.status).toBe(200);
    expect(target()?.role).toBe(RoleName.SUPPORT);
  });

  it.each([AUTH_SESSION_FRESH_AGE - 60, STALE_AGE])('refuses a non-admin session of age %is without changing the user', async (age) => {
    const cookie = await signIn(TARGET_EMAIL);
    ageSessions(t.db, age);

    const res = await request('/admin/set-role', { cookie, body: { userId: targetId, role: RoleName.ADMIN } });

    expect(res.status).toBe(403);
    expect(target()?.role).toBe(RoleName.USER);
  });

  it('gives a fresh non-admin session the role refusal, not SESSION_NOT_FRESH', async () => {
    const cookie = await signIn(TARGET_EMAIL);

    const res = await request('/admin/set-role', { cookie, body: { userId: targetId, role: RoleName.ADMIN } });

    expect(res.status).toBe(403);
    expect(await codeOf(res)).not.toBe(AuthErrorCode.SESSION_NOT_FRESH);
  });

  it('still lets a server-side call with no session create a user, as the seed does', async () => {
    const { user } = await t.auth.api.createUser({ body: { name: 'Seeded', email: 'seeded@example.com', password: PASSWORD } });

    expect(user.email).toBe('seeded@example.com');
  });

  it('refuses a signed-out request with UNAUTHORIZED', async () => {
    const res = await request('/admin/set-role', { body: { userId: targetId, role: RoleName.ADMIN } });

    expect(res.status).toBe(401);
    expect(target()?.role).toBe(RoleName.USER);
  });
});

describe('admin reads and ending an impersonation', () => {
  it.each([
    { path: '/admin/get-user', query: () => `?id=${targetId}`, body: () => undefined },
    { path: '/admin/list-users', query: () => '', body: () => undefined },
    { path: '/admin/list-user-sessions', query: () => '', body: () => ({ userId: targetId }) },
    { path: '/admin/has-permission', query: () => '', body: () => ({ permissions: { user: ['list'] } }) },
  ])('answers $path on a stale admin session', async ({ path, query, body }) => {
    const cookie = await signIn(ADMIN_EMAIL);
    ageSessions(t.db, STALE_AGE);

    const res = await request(`${path}${query()}`, { cookie, body: body() });

    expect(res.status).toBe(200);
  });

  it('stops an impersonation whose sessions have gone stale', async () => {
    const adminCookie = await signIn(ADMIN_EMAIL);
    const impersonating = await request('/admin/impersonate-user', { cookie: adminCookie, body: { userId: targetId } });
    expect(impersonating.status).toBe(200);
    const asTarget = cookiesFrom(impersonating, adminCookie);
    ageSessions(t.db, STALE_AGE);

    const res = await request('/admin/stop-impersonating', { cookie: asTarget, body: {} });

    expect(res.status).toBe(200);
  });
});
