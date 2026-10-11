import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminExampleController } from '../admin/admin-example.controller';
import { ApplicationController } from '../application.controller';
import type { AuthService } from '../auth/auth.service';
import { validEnvs } from '../common/configs/tests/env-fixtures';
import { buildAuthSession, buildAuthUser } from '../common/testing/factories';
import type { StorageWebhookController } from '../storage/storage-webhook.controller';
import { UsersController } from '../users/users.controller';

const handler = vi.fn();
const getSession = vi.fn();
const authService = { auth: { handler, api: { getSession } } } as unknown as AuthService;

function buildApp() {
  return new ApplicationController(
    authService,
    new UsersController(),
    {
      routes: () => new Hono(),
    } as unknown as StorageWebhookController,
    new AdminExampleController(authService),
  ).registerControllers();
}

beforeEach(() => {
  for (const [key, value] of Object.entries(validEnvs)) vi.stubEnv(key, value);
  handler.mockReset().mockImplementation(async () => new Response('from-better-auth'));
  getSession.mockReset().mockResolvedValue(null);
});

describe('auth handler mount', () => {
  it('routes /api/auth/* to Better Auth before the session middleware runs', async () => {
    const res = await buildApp().request('/api/auth/sign-in/email', { method: 'POST' });

    expect(await res.text()).toBe('from-better-auth');
    expect(handler).toHaveBeenCalledOnce();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('still resolves the session for other routes', async () => {
    await buildApp().request('/api/users/me');

    expect(getSession).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('GET /api/users/me', () => {
  it('returns the signed-in user', async () => {
    const user = buildAuthUser();
    getSession.mockResolvedValue({ user, session: buildAuthSession({ userId: user.id }) });

    const res = await buildApp().request('/api/users/me');

    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }).id).toBe(user.id);
  });

  it('returns the narrowed roles list instead of the stored role', async () => {
    const user = buildAuthUser({ role: 'admin' });
    getSession.mockResolvedValue({ user, session: buildAuthSession({ userId: user.id }) });

    const body = (await (await buildApp().request('/api/users/me')).json()) as Record<string, unknown>;

    expect(body.roles).toEqual(['admin']);
    expect(body).not.toHaveProperty('role');
  });

  it('narrows a multi-valued stored role to the least-privileged role while the switch is off', async () => {
    const user = buildAuthUser({ role: 'admin,support' });
    getSession.mockResolvedValue({ user, session: buildAuthSession({ userId: user.id }) });

    const body = (await (await buildApp().request('/api/users/me')).json()) as { roles: string[] };

    expect(body.roles).toEqual(['user']);
  });

  it('returns null when signed out', async () => {
    const res = await buildApp().request('/api/users/me');

    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });
});
