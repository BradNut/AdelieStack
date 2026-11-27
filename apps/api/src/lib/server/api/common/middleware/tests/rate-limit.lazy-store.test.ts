import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimit } from '#lib/server/api/common/middleware/rate-limit.middleware';
import type { HonoEnv } from '#lib/server/api/common/utils/hono';
import {
  createFakeValkey,
  type FakeValkey,
  LIMIT,
  PATH,
  requestPastLimit,
  requestWhileValkeyDown,
  WINDOW_MS,
} from '#lib/server/api/common/utils/tests/hono-rate-limiter-valkey-test.helpers';
import { rateLimitTestMocks } from './rate-limit-test.mocks';

// `hono-rate-limiter` stays real here: only the Valkey connection underneath it is replaced.
vi.mock('@needle-di/core', async (original) => (await import('./rate-limit-test.mocks')).rateLimitTestMocks.createNeedleDiMock(original));

function limitedApp() {
  return new Hono<HonoEnv>().get(PATH, rateLimit({ limit: LIMIT, minutes: 1 }), (c) => c.text('ok'));
}

describe('rate-limit store on first use', () => {
  let valkey: FakeValkey;

  const evalArgs = () => rateLimitTestMocks.callMock.mock.calls.filter(([command]) => command === 'EVALSHA').map((call) => call.slice(1));

  function connectFreshValkey() {
    valkey = createFakeValkey();
    rateLimitTestMocks.callMock.mockImplementation(valkey.call);
  }

  async function scriptLoadsOfOneFirstRequest() {
    await limitedApp().request(PATH);
    const loads = valkey.scriptLoads();
    connectFreshValkey();
    return loads;
  }

  beforeEach(() => {
    rateLimitTestMocks.resetRateLimitMocks();
    connectFreshValkey();
  });

  it('sends no Valkey command while routes are built', () => {
    limitedApp();

    expect(valkey.commands).toEqual([]);
  });

  it('connects on the first request and counts that request', async () => {
    const app = limitedApp();

    const response = await app.request(PATH);

    expect(response.status).toBe(200);
    expect(valkey.scriptLoads()).toBeGreaterThan(0);
    expect(response.headers.get('RateLimit-Remaining')).toBe(String(LIMIT - 1));
  });

  it('refuses requests over the limit from the first use on', async () => {
    expect(await requestPastLimit(limitedApp())).toEqual([200, 200, 429]);
  });

  it('applies the configured window to the store it builds', async () => {
    await limitedApp().request(PATH);

    expect(evalArgs()[0]).toContain(String(WINDOW_MS));
  });

  it('shares one store between concurrent first requests', async () => {
    const oneStore = await scriptLoadsOfOneFirstRequest();
    const app = limitedApp();

    const responses = await Promise.all(Array.from({ length: 5 }, () => app.request(PATH)));

    expect(valkey.scriptLoads()).toBe(oneStore);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 429, 429, 429]);
  });

  it('keeps one store across later requests', async () => {
    const app = limitedApp();
    await app.request(PATH);
    const afterFirstRequest = valkey.scriptLoads();

    await app.request(PATH);

    expect(valkey.scriptLoads()).toBe(afterFirstRequest);
  });

  it('keeps separate stores for separately limited routes', async () => {
    await limitedApp().request(PATH);
    const oneRoute = valkey.scriptLoads();

    await limitedApp().request(PATH);

    expect(valkey.scriptLoads()).toBe(oneRoute * 2);
  });

  it('returns an error while Valkey is down on the first request, then enforces limits once it is back', async () => {
    const app = limitedApp();

    const failed = await requestWhileValkeyDown(valkey, app);

    expect(failed.status).toBe(500);
    expect(await requestPastLimit(app)).toEqual([200, 200, 429]);
  });

  it('never contacts Valkey and never refuses when DISABLE_RATE_LIMIT is on', async () => {
    rateLimitTestMocks.disableRateLimitMock.value = true;

    expect(await requestPastLimit(limitedApp())).toEqual([200, 200, 200]);
    expect(valkey.commands).toEqual([]);
  });
});
