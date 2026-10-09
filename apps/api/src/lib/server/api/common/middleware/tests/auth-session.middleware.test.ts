import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../../../auth/auth.service';
import { buildAuthSession, buildAuthUser } from '../../testing/factories';
import { createHono } from '../../utils/hono';
import { authSession } from '../auth-session.middleware';

const getSession = vi.fn();
const authService = { auth: { api: { getSession } } } as unknown as AuthService;

function buildApp() {
  return createHono()
    .use(authSession(authService))
    .get('/whoami', (c) => c.json({ userId: c.var.user?.id ?? null, sessionUserId: c.var.session?.userId ?? null }));
}

describe('authSession middleware', () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it('exposes the Better Auth user and session on the context when signed in', async () => {
    const user = buildAuthUser();
    getSession.mockResolvedValue({ user, session: buildAuthSession({ userId: user.id }) });

    const res = await buildApp().request('/whoami');

    await expect(res.json()).resolves.toEqual({ userId: user.id, sessionUserId: user.id });
  });

  it('sets user and session to null when signed out', async () => {
    getSession.mockResolvedValue(null);

    const res = await buildApp().request('/whoami');

    await expect(res.json()).resolves.toEqual({ userId: null, sessionUserId: null });
  });

  it('reads the session from the incoming request headers', async () => {
    getSession.mockResolvedValue(null);

    await buildApp().request('/whoami', { headers: { cookie: 'better-auth.session_token=abc' } });

    const [{ headers }] = getSession.mock.calls[0] as [{ headers: Headers }];
    expect(headers.get('cookie')).toBe('better-auth.session_token=abc');
  });
});
