import { vi } from 'vitest';
import type { RedisService } from '#lib/server/api/databases/redis/redis.service';

const MS_PER_SECOND = 1000;

/**
 * Records real Redis keys/values in memory instead of hitting a live Redis instance. Expiries follow `Date.now()`, so
 * a test can move the clock (`vi.setSystemTime`) to let keys expire.
 */
export function createRedisServiceMock() {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  const expiresAt = (seconds: number) => Date.now() + Math.floor(seconds) * MS_PER_SECOND;
  /** The live entry at `prefix:key`, dropping it once expired, as Redis does. */
  const read = (redisKey: string) => {
    const entry = store.get(redisKey);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      store.delete(redisKey);
      return undefined;
    }
    return entry;
  };
  const secondsLeft = (entry: { expiresAt?: number }) =>
    entry.expiresAt === undefined ? -1 : Math.ceil((entry.expiresAt - Date.now()) / MS_PER_SECOND);

  const get = vi.fn<RedisService['get']>(async ({ prefix, key }) => read(`${prefix}:${key}`)?.value ?? null);
  const set = vi.fn<RedisService['set']>(async ({ prefix, key, value }) => {
    store.set(`${prefix}:${key}`, { value });
  });
  const setWithExpiry = vi.fn<RedisService['setWithExpiry']>(async ({ prefix, key, value, expiry }) => {
    store.set(`${prefix}:${key}`, { value, expiresAt: expiresAt(expiry) });
  });
  const del = vi.fn<RedisService['delete']>(async ({ prefix, key }) => {
    store.delete(`${prefix}:${key}`);
  });
  // Simplified: every hit reports the whole window as left, so rate-limit tests can expect it exactly.
  const incrementWithExpiry = vi.fn<RedisService['incrementWithExpiry']>(async ({ prefix, key, expiry }) => {
    const redisKey = `${prefix}:${key}`;
    const count = Number(read(redisKey)?.value ?? 0) + 1;
    store.set(redisKey, { value: String(count), expiresAt: expiresAt(expiry) });
    return { count, ttl: expiry };
  });
  // Every hit restarts the expiry.
  const incrementWithIdleExpiry = vi.fn<RedisService['incrementWithIdleExpiry']>(async ({ prefix, key, expiry }) => {
    const redisKey = `${prefix}:${key}`;
    const count = Number(read(redisKey)?.value ?? 0) + 1;
    store.set(redisKey, { value: String(count), expiresAt: expiresAt(expiry) });
    return count;
  });
  const ttl = vi.fn<RedisService['ttl']>(async ({ prefix, key }) => {
    const entry = read(`${prefix}:${key}`);
    return entry ? secondsLeft(entry) : -2;
  });
  const scan = vi.fn<RedisService['scan']>(async () => []);
  // Raw client for code that talks to ioredis directly (hono-rate-limiter's RedisStore sends every command
  // through `call`); commands resolve to null and never open a connection.
  const redis = { call: vi.fn(async (..._args: (string | number)[]): Promise<unknown> => null) };

  return { get, set, setWithExpiry, delete: del, incrementWithExpiry, incrementWithIdleExpiry, ttl, scan, redis, store };
}

export type RedisServiceMock = ReturnType<typeof createRedisServiceMock>;
