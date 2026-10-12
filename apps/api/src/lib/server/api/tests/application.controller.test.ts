import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationController } from '../application.controller';
import type { AuthService } from '../auth/auth.service';
import { validEnvs } from '../common/configs/tests/env-fixtures';
import { buildAuthSession, buildAuthUser } from '../common/testing/factories';
import type { StorageWebhookController } from '../storage/storage-webhook.controller';
import { UsersController } from '../users/users.controller';

const handler = vi.fn();
const getSession = vi.fn();
const hibpStatus = { health: 'unknown' };
const captchaStatus = { health: 'disabled' };
const captchaPublicConfig = { enabled: false } as { enabled: boolean; provider?: string; siteKey?: string };
const authService = { auth: { handler, api: { getSession } }, hibpStatus, captchaStatus, captchaPublicConfig } as unknown as AuthService;

function buildApp() {
  return new ApplicationController(authService, new UsersController(), {
    routes: () => new Hono(),
  } as unknown as StorageWebhookController).registerControllers();
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

  it('returns null when signed out', async () => {
    const res = await buildApp().request('/api/users/me');

    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });
});
