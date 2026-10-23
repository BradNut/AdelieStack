import { vi } from 'vitest';
import type { RedisService } from '#lib/server/api/databases/redis/redis.service';

/** Records real Redis keys/values in memory instead of hitting a live Redis instance. */
export function createRedisServiceMock() {
  const store = new Map<string, { value: string; expiry?: number }>();

  const get = vi.fn<RedisService['get']>(async ({ prefix, key }) => store.get(`${prefix}:${key}`)?.value ?? null);
  const set = vi.fn<RedisService['set']>(async ({ prefix, key, value }) => {
    store.set(`${prefix}:${key}`, { value });
  });
  const setWithExpiry = vi.fn<RedisService['setWithExpiry']>(async ({ prefix, key, value, expiry }) => {
    store.set(`${prefix}:${key}`, { value, expiry });
  });
  const del = vi.fn<RedisService['delete']>(async ({ prefix, key }) => {
    store.delete(`${prefix}:${key}`);
  });
  const incrementWithExpiry = vi.fn<RedisService['incrementWithExpiry']>(async ({ prefix, key, expiry }) => {
    const count = Number(store.get(`${prefix}:${key}`)?.value ?? 0) + 1;
    store.set(`${prefix}:${key}`, { value: String(count), expiry });
    return { count, ttl: expiry };
  });
  const scan = vi.fn<RedisService['scan']>(async () => []);
  // Raw client for code that talks to ioredis directly (hono-rate-limiter's RedisStore sends every command
  // through `call`); commands resolve to null and never open a connection.
  const redis = { call: vi.fn(async (..._args: (string | number)[]): Promise<unknown> => null) };

  return { get, set, setWithExpiry, delete: del, incrementWithExpiry, scan, redis, store };
}

export type RedisServiceMock = ReturnType<typeof createRedisServiceMock>;
