import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminExampleController } from '#lib/server/api/admin/admin-example.controller';
import { ApplicationController } from '#lib/server/api/application.controller';
import type { AuthService } from '#lib/server/api/auth/auth.service';
import { RolesService } from '#lib/server/api/auth/roles';
import type { ConfigService } from '#lib/server/api/common/configs/config.service';
import { validEnvs } from '#lib/server/api/common/configs/tests/env-fixtures';
import type { LoggerService } from '#lib/server/api/common/services/logger.service';
import { buildAuthSession, buildAuthUser } from '#lib/server/api/common/testing/factories';
import { ConfigController } from '#lib/server/api/config/config.controller';
import type { StorageWebhookController } from '#lib/server/api/storage/storage-webhook.controller';
import { UsersController } from '#lib/server/api/users/users.controller';

const handler = vi.fn();
const getSession = vi.fn();
const hibpStatus = { health: 'unknown' };
const captchaStatus = { health: 'disabled' };
const captchaPublicConfig = { enabled: false } as { enabled: boolean; provider?: string; siteKey?: string };
const rolesService = new RolesService(
  { envs: { ALLOW_MULTIPLE_ROLES: false } } as ConfigService,
  { log: { warn: vi.fn() } } as unknown as LoggerService,
);
const authService = { auth: { handler, api: { getSession } }, hibpStatus, captchaStatus, captchaPublicConfig } as unknown as AuthService;

function buildApp() {
  return new ApplicationController(
    authService,
    new UsersController(rolesService),
    {
      routes: () => new Hono(),
    } as unknown as StorageWebhookController,
    new ConfigController({ envs: { SIGN_UP_ENABLED: true } } as unknown as ConfigService),
    new AdminExampleController(authService, rolesService),
  ).registerControllers();
}

beforeEach(() => {
  for (const [key, value] of Object.entries(validEnvs)) vi.stubEnv(key, value);
  handler.mockReset().mockImplementation(async () => new Response('from-better-auth'));
  getSession.mockReset().mockResolvedValue(null);
  hibpStatus.health = 'unknown';
  captchaStatus.health = 'disabled';
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

describe('GET /healthz', () => {
  it.each(['disabled', 'unknown', 'available', 'unavailable'])('reports HIBP as %s without touching Better Auth', async (health) => {
    hibpStatus.health = health;

    const res = await buildApp().request('/healthz');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', hibp: health, captcha: 'disabled' });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(['disabled', 'unknown', 'available', 'unavailable'])('reports captcha as %s without touching Better Auth', async (health) => {
    captchaStatus.health = health;

    const res = await buildApp().request('/healthz');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', hibp: 'unknown', captcha: health });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('GET /api/config/captcha', () => {
  it('reports captcha off without provider details', async () => {
    const res = await buildApp().request('/api/config/captcha');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
    expect(getSession).toHaveBeenCalledOnce();
  });

  it('returns the public config when on', async () => {
    Object.assign(captchaPublicConfig, { enabled: true, provider: 'hcaptcha', siteKey: 'site' });

    const res = await buildApp().request('/api/config/captcha');

    expect(await res.json()).toEqual({ enabled: true, provider: 'hcaptcha', siteKey: 'site' });
    Object.assign(captchaPublicConfig, { enabled: false, provider: undefined, siteKey: undefined });
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

describe('GET /api/config', () => {
  it('is public: returns signUpEnabled without a session', async () => {
    const res = await buildApp().request('/api/config');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signUpEnabled: true });
  });
});
