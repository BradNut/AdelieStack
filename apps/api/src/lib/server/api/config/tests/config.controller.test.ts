import { Container } from '@needle-di/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '#lib/server/api/auth/auth.service';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { buildRouteApp, resetRouteTestMocks } from '#lib/server/api/common/testing/route-test-harness';
import type { AppOpenAPI } from '#lib/server/api/common/utils/hono';
import { ConfigController } from '#lib/server/api/config/config.controller';

const buildApp = (envs: Record<string, unknown>, enabledSocialProviders: string[] = []) => {
  const container = new Container();
  container.bind({ provide: ConfigService, useValue: { envs } as unknown as ConfigService });
  container.bind({ provide: AuthService, useValue: { enabledSocialProviders } as unknown as AuthService });
  return buildRouteApp(container.get(ConfigController).routes() as AppOpenAPI, '/config');
};

describe('GET /config', () => {
  beforeEach(() => {
    resetRouteTestMocks();
  });

  it('reports sign-up closed when the env is not enabled', async () => {
    const res = await buildApp({ SIGN_UP_ENABLED: false }).request('/config');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signUpEnabled: false, socialProviders: [] });
  });

  it('reports sign-up closed when the env is unset', async () => {
    const res = await buildApp({}).request('/config');

    expect(await res.json()).toEqual({ signUpEnabled: false, socialProviders: [] });
  });

  it('reports sign-up open when enabled', async () => {
    const res = await buildApp({ SIGN_UP_ENABLED: true }).request('/config');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signUpEnabled: true, socialProviders: [] });
  });

  it('needs no authentication', async () => {
    // The harness runs the route as a signed-out visitor unless given a user.
    const res = await buildApp({ SIGN_UP_ENABLED: true }).request('/config');

    expect(res.status).toBe(200);
  });

  it('lists the providers AuthService reports, and nothing from the credentials', async () => {
    const res = await buildApp({ GITHUB_CLIENT_ID: 'gh-id', GITHUB_CLIENT_SECRET: 'gh-secret' }, ['github']).request('/config');

    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ signUpEnabled: false, socialProviders: ['github'] });
    expect(text).not.toContain('gh-secret');
  });
});
