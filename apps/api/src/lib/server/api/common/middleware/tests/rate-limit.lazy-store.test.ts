import { Hono } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import type Redis from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimit } from '#lib/server/api/common/middleware/rate-limit.middleware';
import type { HonoEnv } from '#lib/server/api/common/utils/hono';
import { adaptIoredisForHonoRateLimiter, createLazyRedisStore } from '#lib/server/api/common/utils/hono-rate-limiter-redis-client';
import { rateLimitTestMocks } from './rate-limit-test.mocks';

// `hono-rate-limiter` stays real here: only the Redis connection underneath it is replaced.
vi.mock('@needle-di/core', async (original) => (await import('./rate-limit-test.mocks')).rateLimitTestMocks.createNeedleDiMock(original));

const PATH = '/limited';
const LIMIT = 2;
/** `minutes: 1`, written out so a wrong conversion or a dropped window fails here. */
const WINDOW_MS = '60000';
/** One load per script `RedisStore` uses. */
const SCRIPTS_PER_STORE = 3;

/** Just enough Redis for the three Lua scripts `RedisStore` runs, identified by the commands they contain. */
function createFakeRedis() {
  const hits = new Map<string, number>();
  const redis = {
    commands: [] as string[],
    /** While set, every command is refused, as when Redis is unreachable. */
    down: false,
    /** Refuses to load the scripts it matches. */
    refuseScript: (_script: string): boolean => false,
    async call(command: string, ...args: (string | number)[]): Promise<unknown> {
      redis.commands.push(command);
      if (redis.down) throw new Error('connect ECONNREFUSED redis');
      if (command === 'SCRIPT') {
        if (redis.refuseScript(String(args[1]))) throw new Error('script refused');
        return args[1];
      }
      if (command === 'DEL') return hits.delete(String(args[0])) ? 1 : 0;
      if (command !== 'EVALSHA') throw new Error(`Unexpected Redis command ${command}`);

      const script = String(args[0]);
      const key = String(args[2]);
      if (script.includes('INCR')) hits.set(key, (hits.get(key) ?? 0) + 1);
      return [hits.get(key) ?? false, 60_000];
    },
  };
  return redis;
}

function limitedApp() {
  return new Hono<HonoEnv>().get(PATH, rateLimit({ limit: LIMIT, minutes: 1 }), (c) => c.text('ok'));
}

describe('rate-limit store on first use', () => {
  let redis: ReturnType<typeof createFakeRedis>;

  const scriptLoads = () => redis.commands.filter((command) => command === 'SCRIPT').length;
  const evalArgs = () => rateLimitTestMocks.callMock.mock.calls.filter(([command]) => command === 'EVALSHA').map((call) => call.slice(1));

  beforeEach(() => {
    rateLimitTestMocks.resetRateLimitMocks();
    redis = createFakeRedis();
    rateLimitTestMocks.callMock.mockImplementation(redis.call);
  });

  it('sends no Redis command while routes are built', () => {
    limitedApp();

    expect(redis.commands).toEqual([]);
  });

  it('connects on the first request and counts that request', async () => {
    const app = limitedApp();

    const response = await app.request(PATH);

    expect(response.status).toBe(200);
    expect(scriptLoads()).toBe(SCRIPTS_PER_STORE);
    expect(response.headers.get('RateLimit-Remaining')).toBe(String(LIMIT - 1));
  });

  it('refuses requests over the limit from the first use on', async () => {
    const app = limitedApp();

    const statuses = [];
    for (let request = 0; request <= LIMIT; request++) statuses.push((await app.request(PATH)).status);

    expect(statuses).toEqual([200, 200, 429]);
  });

  it('applies the configured window to the store it builds', async () => {
    await limitedApp().request(PATH);

    expect(evalArgs()[0]).toContain(WINDOW_MS);
  });

  it('shares one store between concurrent first requests', async () => {
    const app = limitedApp();

    const responses = await Promise.all(Array.from({ length: 5 }, () => app.request(PATH)));

    expect(scriptLoads()).toBe(SCRIPTS_PER_STORE);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 429, 429, 429]);
  });

  it('keeps one store across later requests', async () => {
    const app = limitedApp();

    await app.request(PATH);
    await app.request(PATH);

    expect(scriptLoads()).toBe(SCRIPTS_PER_STORE);
  });

  it('keeps separate stores for separately limited routes', async () => {
    await limitedApp().request(PATH);
    await limitedApp().request(PATH);

    expect(scriptLoads()).toBe(SCRIPTS_PER_STORE * 2);
  });

  it('never contacts Redis and never refuses when DISABLE_RATE_LIMIT is on', async () => {
    rateLimitTestMocks.disableRateLimitMock.value = true;
    const app = limitedApp();

    const statuses = [];
    for (let request = 0; request <= LIMIT; request++) statuses.push((await app.request(PATH)).status);

    expect(statuses).toEqual([200, 200, 200]);
    expect(redis.commands).toEqual([]);
  });
});

describe('rate-limit store after a Redis failure on first use', () => {
  const KEY = 'client';
  let redis: ReturnType<typeof createFakeRedis>;
  let store: ReturnType<typeof createLazyRedisStore>;
  let app: Hono;

  const scriptLoads = () => redis.commands.filter((command) => command === 'SCRIPT').length;

  beforeEach(() => {
    rateLimitTestMocks.resetRateLimitMocks();
    redis = createFakeRedis();
    store = createLazyRedisStore(() => ({ call: redis.call }) as unknown as Redis);
    app = new Hono().get(PATH, rateLimiter({ windowMs: 60_000, limit: LIMIT, keyGenerator: () => KEY, store }), (c) => c.text('ok'));
  });

  it('does not let a request through while Redis is down', async () => {
    redis.down = true;

    expect((await app.request(PATH)).status).toBe(500);
  });

  it('enforces limits again once Redis is back', async () => {
    redis.down = true;
    await app.request(PATH);
    redis.down = false;

    const statuses = [];
    for (let request = 0; request <= LIMIT; request++) statuses.push((await app.request(PATH)).status);

    expect(statuses).toEqual([200, 200, 429]);
  });

  it('reads a hit count once Redis is back', async () => {
    redis.down = true;
    await app.request(PATH);
    redis.down = false;

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
    redis.down = true;
    await app.request(PATH);
    redis.down = false;
    redis.commands.length = 0;

    await Promise.all(Array.from({ length: 5 }, () => app.request(PATH)));

    expect(scriptLoads()).toBe(SCRIPTS_PER_STORE);
  });

  it('keeps a working store when Redis fails after its scripts loaded', async () => {
    await app.request(PATH);
    redis.down = true;
    expect((await app.request(PATH)).status).toBe(500);
    redis.down = false;
    redis.commands.length = 0;

    await app.request(PATH);

    // The library reloads the one script that failed; a rebuilt store would load all of them.
    expect(scriptLoads()).toBe(1);
  });
});

describe('adaptIoredisForHonoRateLimiter', () => {
  it('sends commands through the client it is given', async () => {
    rateLimitTestMocks.callMock.mockResolvedValue(1);
    const client = adaptIoredisForHonoRateLimiter(() => ({ call: rateLimitTestMocks.callMock }) as unknown as Redis);

    await client.decr('foo');

    expect(rateLimitTestMocks.callMock).toHaveBeenCalledWith('DECR', 'foo');
  });
});
