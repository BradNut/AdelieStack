import { Hono } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import type Redis from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adaptIoredisForHonoRateLimiter, createLazyValkeyStore } from '#lib/server/api/common/utils/hono-rate-limiter-valkey';
import {
  createFakeValkey,
  type FakeValkey,
  LIMIT,
  PATH,
  requestPastLimit,
  requestWhileValkeyDown,
  WINDOW_MS,
} from './hono-rate-limiter-valkey-test.helpers';

const KEY = 'client';

function limitedApp(valkey: FakeValkey) {
  const store = createLazyValkeyStore(() => ({ call: valkey.call }) as unknown as Redis);
  const app = new Hono().get(PATH, rateLimiter({ windowMs: WINDOW_MS, limit: LIMIT, keyGenerator: () => KEY, store }), (c) => c.text('ok'));
  return { app, store };
}

async function scriptLoadsOfOneFirstRequest() {
  const valkey = createFakeValkey();
  await limitedApp(valkey).app.request(PATH);
  return valkey.scriptLoads();
}

describe('createLazyValkeyStore after a Valkey failure on first use', () => {
  let valkey: FakeValkey;
  let store: ReturnType<typeof limitedApp>['store'];
  let app: ReturnType<typeof limitedApp>['app'];

  beforeEach(() => {
    valkey = createFakeValkey();
    ({ app, store } = limitedApp(valkey));
  });

  it('does not let a request through while Valkey is down', async () => {
    const response = await requestWhileValkeyDown(valkey, app);

    expect(response.status).toBe(500);
  });

  it('enforces limits again once Valkey is back', async () => {
    await requestWhileValkeyDown(valkey, app);

    expect(await requestPastLimit(app)).toEqual([200, 200, 429]);
  });

  it('reads a hit count once Valkey is back', async () => {
    await requestWhileValkeyDown(valkey, app);

    await app.request(PATH);

    await expect(store.get(KEY)).resolves.toMatchObject({ totalHits: 1 });
  });

  it('recovers when only one script failed to load', async () => {
    valkey.refuseScript = (script) => !script.includes('INCR') && !script.includes('DECR');
    expect((await app.request(PATH)).status).toBe(200);
    valkey.refuseScript = () => false;

    await app.request(PATH);

    await expect(store.get(KEY)).resolves.toMatchObject({ totalHits: 2 });
  });

  it('shares one new store between concurrent requests after the failure', async () => {
    const oneStore = await scriptLoadsOfOneFirstRequest();
    await requestWhileValkeyDown(valkey, app);
    valkey.commands.length = 0;

    await Promise.all(Array.from({ length: 5 }, () => app.request(PATH)));

    expect(valkey.scriptLoads()).toBe(oneStore);
  });

  it('keeps a working store when Valkey fails after its scripts loaded', async () => {
    const oneStore = await scriptLoadsOfOneFirstRequest();
    await app.request(PATH);
    expect((await requestWhileValkeyDown(valkey, app)).status).toBe(500);
    valkey.commands.length = 0;

    await app.request(PATH);

    // A rebuilt store would load every script again.
    expect(valkey.scriptLoads()).toBeLessThan(oneStore);
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
