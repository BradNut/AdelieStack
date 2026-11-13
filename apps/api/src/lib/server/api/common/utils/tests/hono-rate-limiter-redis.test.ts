import { Hono } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import type Redis from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adaptIoredisForHonoRateLimiter, createLazyRedisStore } from '#lib/server/api/common/utils/hono-rate-limiter-redis';
import {
  createFakeRedis,
  type FakeRedis,
  LIMIT,
  PATH,
  requestPastLimit,
  requestWhileRedisDown,
  WINDOW_MS,
} from './hono-rate-limiter-redis-test.helpers';

const KEY = 'client';

function limitedApp(redis: FakeRedis) {
  const store = createLazyRedisStore(() => ({ call: redis.call }) as unknown as Redis);
  const app = new Hono().get(PATH, rateLimiter({ windowMs: WINDOW_MS, limit: LIMIT, keyGenerator: () => KEY, store }), (c) => c.text('ok'));
  return { app, store };
}

async function scriptLoadsOfOneFirstRequest() {
  const redis = createFakeRedis();
  await limitedApp(redis).app.request(PATH);
  return redis.scriptLoads();
}

describe('createLazyRedisStore after a Redis failure on first use', () => {
  let redis: FakeRedis;
  let store: ReturnType<typeof limitedApp>['store'];
  let app: ReturnType<typeof limitedApp>['app'];

  beforeEach(() => {
    redis = createFakeRedis();
    ({ app, store } = limitedApp(redis));
  });

  it('does not let a request through while Redis is down', async () => {
    const response = await requestWhileRedisDown(redis, app);

    expect(response.status).toBe(500);
  });

  it('enforces limits again once Redis is back', async () => {
    await requestWhileRedisDown(redis, app);

    expect(await requestPastLimit(app)).toEqual([200, 200, 429]);
  });

  it('reads a hit count once Redis is back', async () => {
    await requestWhileRedisDown(redis, app);

    await app.request(PATH);

    await expect(store.get(KEY)).resolves.toMatchObject({ totalHits: 1 });
  });

  it('recovers when only one script failed to load', async () => {
    redis.refuseScript = (script) => !script.includes('INCR') && !script.includes('DECR');
    expect((await app.request(PATH)).status).toBe(200);
    redis.refuseScript = () => false;

    await app.request(PATH);

    await expect(store.get(KEY)).resolves.toMatchObject({ totalHits: 2 });
  });

  it('shares one new store between concurrent requests after the failure', async () => {
    const oneStore = await scriptLoadsOfOneFirstRequest();
    await requestWhileRedisDown(redis, app);
    redis.commands.length = 0;

    await Promise.all(Array.from({ length: 5 }, () => app.request(PATH)));

    expect(redis.scriptLoads()).toBe(oneStore);
  });

  it('keeps a working store when Redis fails after its scripts loaded', async () => {
    const oneStore = await scriptLoadsOfOneFirstRequest();
    await app.request(PATH);
    expect((await requestWhileRedisDown(redis, app)).status).toBe(500);
    redis.commands.length = 0;

    await app.request(PATH);

    // A rebuilt store would load every script again.
    expect(redis.scriptLoads()).toBeLessThan(oneStore);
  });
});

describe('adaptIoredisForHonoRateLimiter', () => {
  it('sends commands through the client it is given', async () => {
    const call = vi.fn().mockResolvedValue(1);
    const client = adaptIoredisForHonoRateLimiter(() => ({ call }) as unknown as Redis);

    await client.decr('foo');

    expect(call).toHaveBeenCalledWith('DECR', 'foo');
  });
});
