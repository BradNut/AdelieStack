import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimit } from '#lib/server/api/common/middleware/rate-limit.middleware';
import type { HonoEnv } from '#lib/server/api/common/utils/hono';
import {
  createFakeRedis,
  type FakeRedis,
  LIMIT,
  PATH,
  requestPastLimit,
  requestWhileRedisDown,
  WINDOW_MS,
} from '#lib/server/api/common/utils/tests/hono-rate-limiter-redis-test.helpers';
import { rateLimitTestMocks } from './rate-limit-test.mocks';

// `hono-rate-limiter` stays real here: only the Redis connection underneath it is replaced.
vi.mock('@needle-di/core', async (original) => (await import('./rate-limit-test.mocks')).rateLimitTestMocks.createNeedleDiMock(original));

function limitedApp() {
  return new Hono<HonoEnv>().get(PATH, rateLimit({ limit: LIMIT, minutes: 1 }), (c) => c.text('ok'));
}

describe('rate-limit store on first use', () => {
  let redis: FakeRedis;

  const evalArgs = () => rateLimitTestMocks.callMock.mock.calls.filter(([command]) => command === 'EVALSHA').map((call) => call.slice(1));

  function connectFreshRedis() {
    redis = createFakeRedis();
    rateLimitTestMocks.callMock.mockImplementation(redis.call);
  }

  async function scriptLoadsOfOneFirstRequest() {
    await limitedApp().request(PATH);
    const loads = redis.scriptLoads();
    connectFreshRedis();
    return loads;
  }

  beforeEach(() => {
    rateLimitTestMocks.resetRateLimitMocks();
    connectFreshRedis();
  });

  it('sends no Redis command while routes are built', () => {
    limitedApp();

    expect(redis.commands).toEqual([]);
  });

  it('connects on the first request and counts that request', async () => {
    const app = limitedApp();

    const response = await app.request(PATH);

    expect(response.status).toBe(200);
    expect(redis.scriptLoads()).toBeGreaterThan(0);
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

    expect(redis.scriptLoads()).toBe(oneStore);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 429, 429, 429]);
  });

  it('keeps one store across later requests', async () => {
    const app = limitedApp();
    await app.request(PATH);
    const afterFirstRequest = redis.scriptLoads();

    await app.request(PATH);

    expect(redis.scriptLoads()).toBe(afterFirstRequest);
  });

  it('keeps separate stores for separately limited routes', async () => {
    await limitedApp().request(PATH);
    const oneRoute = redis.scriptLoads();

    await limitedApp().request(PATH);

    expect(redis.scriptLoads()).toBe(oneRoute * 2);
  });

  it('returns an error while Redis is down on the first request, then enforces limits once it is back', async () => {
    const app = limitedApp();

    const failed = await requestWhileRedisDown(redis, app);

    expect(failed.status).toBe(500);
    expect(await requestPastLimit(app)).toEqual([200, 200, 429]);
  });

  it('never contacts Redis and never refuses when DISABLE_RATE_LIMIT is on', async () => {
    rateLimitTestMocks.disableRateLimitMock.value = true;

    expect(await requestPastLimit(limitedApp())).toEqual([200, 200, 200]);
    expect(redis.commands).toEqual([]);
  });
});
