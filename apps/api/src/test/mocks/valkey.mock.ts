import { vi } from 'vitest';
import type { ValkeyService } from '#lib/server/api/databases/valkey/valkey.service';

const MS_PER_SECOND = 1000;

/**
 * Records real Valkey keys/values in memory instead of hitting a live Valkey instance. Expiries follow `Date.now()`, so
 * a test can move the clock (`vi.setSystemTime`) to let keys expire.
 */
export function createValkeyServiceMock() {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  const expiresAt = (seconds: number) => Date.now() + Math.floor(seconds) * MS_PER_SECOND;
  /** The live entry at `prefix:key`, dropping it once expired, as Valkey does. */
  const read = (namespacedKey: string) => {
    const entry = store.get(namespacedKey);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      store.delete(namespacedKey);
      return undefined;
    }
    return entry;
  };
  const secondsLeft = (entry: { expiresAt?: number }) =>
    entry.expiresAt === undefined ? -1 : Math.ceil((entry.expiresAt - Date.now()) / MS_PER_SECOND);

  const get = vi.fn<ValkeyService['get']>(async ({ prefix, key }) => read(`${prefix}:${key}`)?.value ?? null);
  const set = vi.fn<ValkeyService['set']>(async ({ prefix, key, value }) => {
    store.set(`${prefix}:${key}`, { value });
  });
  const setWithExpiry = vi.fn<ValkeyService['setWithExpiry']>(async ({ prefix, key, value, expiry }) => {
    store.set(`${prefix}:${key}`, { value, expiresAt: expiresAt(expiry) });
  });
  const del = vi.fn<ValkeyService['delete']>(async ({ prefix, key }) => {
    store.delete(`${prefix}:${key}`);
  });
  // Simplified: every hit reports the whole window as left, so rate-limit tests can expect it exactly.
  const incrementWithExpiry = vi.fn<ValkeyService['incrementWithExpiry']>(async ({ prefix, key, expiry }) => {
    const namespacedKey = `${prefix}:${key}`;
    const count = Number(read(namespacedKey)?.value ?? 0) + 1;
    store.set(namespacedKey, { value: String(count), expiresAt: expiresAt(expiry) });
    return { count, ttl: expiry };
  });
  // Every hit restarts the expiry.
  const incrementWithIdleExpiry = vi.fn<ValkeyService['incrementWithIdleExpiry']>(async ({ prefix, key, expiry }) => {
    const namespacedKey = `${prefix}:${key}`;
    const count = Number(read(namespacedKey)?.value ?? 0) + 1;
    store.set(namespacedKey, { value: String(count), expiresAt: expiresAt(expiry) });
    return count;
  });
  const ttl = vi.fn<ValkeyService['ttl']>(async ({ prefix, key }) => {
    const entry = read(`${prefix}:${key}`);
    return entry ? secondsLeft(entry) : -2;
  });
  const scan = vi.fn<ValkeyService['scan']>(async () => []);
  // Raw client for code that talks to ioredis directly (hono-rate-limiter's RedisStore sends every command
  // through `call`); commands resolve to null and never open a connection.
  const client = { call: vi.fn(async (..._args: (string | number)[]): Promise<unknown> => null) };

  return { get, set, setWithExpiry, delete: del, incrementWithExpiry, incrementWithIdleExpiry, ttl, scan, client, store };
}

export type ValkeyServiceMock = ReturnType<typeof createValkeyServiceMock>;
