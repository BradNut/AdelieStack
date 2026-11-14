import {
  AUTH_CLIENT_IP_HEADER,
  AUTH_SESSION_EXPIRES_IN,
  AUTH_SESSION_FRESH_AGE,
  AUTH_SESSION_MAX_LIFETIME,
  AUTH_SESSION_UPDATE_AGE,
  SECONDS_PER_DAY,
} from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { type AuthRequest, ageSessions, cookiesFrom, hasSessionCookie, signUpWithEmail, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const { email: EMAIL, password: PASSWORD } = TEST_USER;

/** The sign-in response that starts a new user's first session, once sign-up and verification are done. */
async function signUpAndSignIn(request: AuthRequest): Promise<Response> {
  await signUpWithEmail(request, TEST_USER);
  return request('/sign-in/email', { body: { email: EMAIL, password: PASSWORD } });
}

describe('session settings', () => {
  it('pins expiry, update age and fresh age to the shared constants', async () => {
    const { auth } = createTestAuth();
    const { options, sessionConfig } = await auth.$context;
    expect(AUTH_SESSION_EXPIRES_IN).toBe(7 * 24 * 60 * 60);
    expect(AUTH_SESSION_UPDATE_AGE).toBe(24 * 60 * 60);
    expect(AUTH_SESSION_FRESH_AGE).toBe(5 * 60);
    expect(sessionConfig.expiresIn).toBe(AUTH_SESSION_EXPIRES_IN);
    expect(sessionConfig.updateAge).toBe(AUTH_SESSION_UPDATE_AGE);
    expect(sessionConfig.freshAge).toBe(AUTH_SESSION_FRESH_AGE);
    expect(options.session?.cookieCache?.enabled).toBe(false);
  });

  it('does not set a session-data cookie', async () => {
    const { request } = createTestAuth();
    const res = await signUpAndSignIn(request);
    const names = res.headers.getSetCookie().map((c) => c.split('=')[0]);
    expect(hasSessionCookie(res)).toBe(true);
    expect(names.some((n) => n.endsWith('session_data'))).toBe(false);
  });

  it('marks the session cookie HttpOnly and SameSite=Lax', async () => {
    const { request } = createTestAuth();
    const res = await signUpAndSignIn(request);
    const token = res.headers.getSetCookie().find((c) => c.includes('session_token')) ?? '';
    expect(token).toContain('HttpOnly');
    expect(token).toMatch(/SameSite=Lax/i);
    expect(token).not.toContain('Secure');
  });
});

describe('fresh vs stale sessions', () => {
  const deleteUser = (request: AuthRequest, cookie: string) => request('/delete-user', { body: {}, cookie });

  it('lets a fresh session run a sensitive action', async () => {
    const { request } = createTestAuth();
    const { cookie } = await signUpWithEmail(request, TEST_USER);
    expect((await deleteUser(request, cookie)).status).toBe(200);
  });

  it('refuses a stale session, then succeeds after re-authentication', async () => {
    const { request, db } = createTestAuth();
    const { cookie } = await signUpWithEmail(request, TEST_USER);
    ageSessions(db, AUTH_SESSION_FRESH_AGE + 60);

    const refused = await deleteUser(request, cookie);
    expect(refused.status).toBe(400);
    expect(db.user).toHaveLength(1);

    const signedIn = await request('/sign-in/email', { body: { email: EMAIL, password: PASSWORD } });
    expect(signedIn.status).toBe(200);
    expect((await deleteUser(request, cookiesFrom(signedIn))).status).toBe(200);
    expect(db.user).toHaveLength(0);
  });
});

describe('absolute session lifetime', () => {
  const MS = 1000;
  const HOUR = 60 * 60;
  const readSession = async (request: AuthRequest, cookie: string) =>
    (await (await request('/get-session', { cookie })).json()) as { session?: { expiresAt: string } } | null;

  /** Makes the session look `ageSeconds` old and due for its sliding refresh (last refreshed over a day ago). */
  function ageAndDueRefresh(db: ReturnType<typeof createTestAuth>['db'], ageSeconds: number): Date {
    const createdAt = new Date(Date.now() - ageSeconds * MS);
    for (const s of db.session) {
      s.createdAt = createdAt;
      s.expiresAt = new Date(Date.now() + (AUTH_SESSION_EXPIRES_IN - AUTH_SESSION_UPDATE_AGE - HOUR) * MS);
    }
    return createdAt;
  }

  it('caps sessions at 30 days from sign-in (NIST 800-63B reauthentication)', () => {
    expect(AUTH_SESSION_MAX_LIFETIME).toBe(30 * 24 * 60 * 60);
  });

  it('still slides a young session forward by the full expiry', async () => {
    const { request, db } = createTestAuth();
    const { cookie } = await signUpWithEmail(request, TEST_USER);
    ageAndDueRefresh(db, 2 * SECONDS_PER_DAY);

    const before = Date.now();
    const session = await readSession(request, cookie);
    expect(new Date(session?.session?.expiresAt ?? 0).getTime()).toBeGreaterThanOrEqual(before + (AUTH_SESSION_EXPIRES_IN - 1) * MS);
  });

  it('does not extend a session past its maximum lifetime when it is used', async () => {
    const { request, db } = createTestAuth();
    const { cookie } = await signUpWithEmail(request, TEST_USER);
    const createdAt = ageAndDueRefresh(db, AUTH_SESSION_MAX_LIFETIME - 2 * SECONDS_PER_DAY);
    const cap = createdAt.getTime() + AUTH_SESSION_MAX_LIFETIME * MS;

    const session = await readSession(request, cookie);
    expect(new Date(session?.session?.expiresAt ?? 0).getTime()).toBe(cap);
    expect(db.session[0].expiresAt).toEqual(new Date(cap));
  });

  it('ends a session once its maximum lifetime has passed, however recently it was used', async () => {
    const { request, db } = createTestAuth();
    const { cookie } = await signUpWithEmail(request, TEST_USER);
    ageAndDueRefresh(db, AUTH_SESSION_MAX_LIFETIME + HOUR);

    expect((await readSession(request, cookie))?.session).toBeUndefined();
    // Using it again does not revive it.
    expect((await readSession(request, cookie))?.session).toBeUndefined();
  });
});

describe('revocation', () => {
  it('stops a revoked session on the next request', async () => {
    const { request, db } = createTestAuth();
    const { cookie } = await signUpWithEmail(request, TEST_USER);
    expect(((await (await request('/get-session', { cookie })).json()) as { user?: unknown } | null)?.user).toBeTruthy();

    db.session.length = 0;

    expect(await (await request('/get-session', { cookie })).json()).toBeNull();
  });

  it('applies a role change on the next request', async () => {
    const { auth, request, db } = createTestAuth();
    const { cookie } = await signUpWithEmail(request, TEST_USER);
    const adapter = (await auth.$context).internalAdapter;
    await adapter.updateUser(db.user[0].id as string, { role: 'admin' });
    const session = (await (await request('/get-session', { cookie })).json()) as { user: { role: string } };
    expect(session.user.role).toBe('admin');
  });
});

describe('client IP', () => {
  async function seenIp(trustProxy: boolean, headers: Record<string, string>) {
    const { request, db } = createTestAuth({ clientIp: { trustProxy, trustedProxies: [] } });
    await signUpWithEmail(request, TEST_USER);
    for (const s of db.session) s.ipAddress = undefined;
    await request('/sign-in/email', { body: { email: EMAIL, password: PASSWORD }, headers });
    return db.session.at(-1)?.ipAddress;
  }

  it('reads the configured header when behind a trusted proxy', async () => {
    expect(await seenIp(true, { [AUTH_CLIENT_IP_HEADER]: '203.0.113.9' })).toBe('203.0.113.9');
  });

  it('ignores other forwarding headers behind a trusted proxy', async () => {
    expect(await seenIp(true, { 'x-real-ip': '203.0.113.9', 'cf-connecting-ip': '203.0.113.9' })).not.toBe('203.0.113.9');
  });

  it('ignores every header without a trusted proxy', async () => {
    expect(await seenIp(false, { [AUTH_CLIENT_IP_HEADER]: '203.0.113.9' })).not.toBe('203.0.113.9');
  });
});
