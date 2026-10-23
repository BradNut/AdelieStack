import { AUTH_CLIENT_IP_HEADER, AUTH_SESSION_EXPIRES_IN, AUTH_SESSION_FRESH_AGE, AUTH_SESSION_UPDATE_AGE } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { cookiesFrom } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const PASSWORD = 'Correct-horse-9';

function build(overrides: Parameters<typeof createTestAuth>[0] = {}) {
  const { auth, db, request } = createTestAuth(overrides);
  const signUp = async (email = 'a@example.com') => {
    const res = await request('/sign-up/email', { body: { name: 'A', email, password: PASSWORD } });
    return { res, cookie: cookiesFrom(res) };
  };
  return { auth, db, request, signUp };
}

describe('session settings', () => {
  it('pins expiry, update age and fresh age to the shared constants', async () => {
    const { auth } = build();
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
    const { signUp } = build();
    const { res } = await signUp();
    const names = res.headers.getSetCookie().map((c) => c.split('=')[0]);
    expect(names.some((n) => n.endsWith('session_token'))).toBe(true);
    expect(names.some((n) => n.endsWith('session_data'))).toBe(false);
  });

  it('marks the session cookie HttpOnly and SameSite=Lax', async () => {
    const { signUp } = build();
    const { res } = await signUp();
    const token = res.headers.getSetCookie().find((c) => c.includes('session_token')) ?? '';
    expect(token).toContain('HttpOnly');
    expect(token).toMatch(/SameSite=Lax/i);
    expect(token).not.toContain('Secure');
  });
});

describe('fresh vs stale sessions', () => {
  const deleteUser = (request: ReturnType<typeof build>['request'], cookie: string) => request('/delete-user', { body: {}, cookie });

  it('lets a fresh session run a sensitive action', async () => {
    const { request, signUp } = build();
    const { cookie } = await signUp();
    expect((await deleteUser(request, cookie)).status).toBe(200);
  });

  it('refuses a stale session, then succeeds after re-authentication', async () => {
    const { request, db, signUp } = build();
    const { cookie } = await signUp();
    for (const s of db.session) s.createdAt = new Date(Date.now() - (AUTH_SESSION_FRESH_AGE + 60) * 1000);

    const refused = await deleteUser(request, cookie);
    expect(refused.status).toBe(400);
    expect(db.user).toHaveLength(1);

    const signedIn = await request('/sign-in/email', { body: { email: 'a@example.com', password: PASSWORD } });
    expect(signedIn.status).toBe(200);
    expect((await deleteUser(request, cookiesFrom(signedIn))).status).toBe(200);
    expect(db.user).toHaveLength(0);
  });
});

describe('revocation', () => {
  it('stops a revoked session on the next request', async () => {
    const { request, db, signUp } = build();
    const { cookie } = await signUp();
    expect(((await (await request('/get-session', { cookie })).json()) as { user?: unknown } | null)?.user).toBeTruthy();

    db.session.length = 0;

    expect(await (await request('/get-session', { cookie })).json()).toBeNull();
  });

  it('applies a role change on the next request', async () => {
    const { auth, request, db, signUp } = build();
    const { cookie } = await signUp();
    const adapter = (await auth.$context).internalAdapter;
    await adapter.updateUser(db.user[0].id as string, { role: 'admin' });
    const session = (await (await request('/get-session', { cookie })).json()) as { user: { role: string } };
    expect(session.user.role).toBe('admin');
  });
});

describe('client IP', () => {
  async function seenIp(trustProxy: boolean, headers: Record<string, string>) {
    const { request, db, signUp } = build({ trustProxy });
    await signUp();
    for (const s of db.session) s.ipAddress = undefined;
    await request('/sign-in/email', { body: { email: 'a@example.com', password: PASSWORD }, headers });
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
