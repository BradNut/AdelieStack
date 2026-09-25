import { vi } from 'vitest';
import type { RedisService } from '../../lib/server/api/databases/redis/redis.service';

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
  const scan = vi.fn<RedisService['scan']>(async () => []);

  return { get, set, setWithExpiry, delete: del, scan, store };
}

export type RedisServiceMock = ReturnType<typeof createRedisServiceMock>;
