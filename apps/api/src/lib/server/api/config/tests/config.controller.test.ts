import { Container } from '@needle-di/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '../../common/configs/config.service';
import { buildRouteApp, resetRouteTestMocks } from '../../common/testing/route-test-harness';
import type { AppOpenAPI } from '../../common/utils/hono';
import { ConfigController } from '../config.controller';

const buildApp = (envs: { SIGN_UP_ENABLED?: boolean }) => {
  const container = new Container();
  container.bind({ provide: ConfigService, useValue: { envs } as unknown as ConfigService });
  return buildRouteApp(container.get(ConfigController).routes() as AppOpenAPI, '/config');
};

describe('GET /config', () => {
  beforeEach(() => {
    resetRouteTestMocks();
  });

  it('reports sign-up closed when the env is not enabled', async () => {
    const res = await buildApp({ SIGN_UP_ENABLED: false }).request('/config');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signUpEnabled: false });
  });

  it('reports sign-up closed when the env is unset', async () => {
    const res = await buildApp({}).request('/config');

    expect(await res.json()).toEqual({ signUpEnabled: false });
  });

  it('reports sign-up open when enabled', async () => {
    const res = await buildApp({ SIGN_UP_ENABLED: true }).request('/config');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signUpEnabled: true });
  });

  it('needs no authentication', async () => {
    // The harness runs the route as a signed-out visitor unless given a user.
    const res = await buildApp({ SIGN_UP_ENABLED: true }).request('/config');

    expect(res.status).toBe(200);
  });
});
