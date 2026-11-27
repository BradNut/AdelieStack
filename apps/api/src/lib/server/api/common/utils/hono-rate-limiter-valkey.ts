import type { Env } from 'hono';
import { type HonoConfigType, type RedisClient, RedisStore } from 'hono-rate-limiter';
import type Redis from 'ioredis';

type IoredisWithCall = Redis & {
  call: (...args: (string | number)[]) => Promise<unknown>;
};

/**
 * Wraps an ioredis client so it satisfies the `RedisClient` interface
 * expected by `hono-rate-limiter`'s `RedisStore`. Valkey commands are sent
 * through `ioredis.call(...)` to avoid the missing type declaration issue.
 */
export function adaptIoredisForHonoRateLimiter(getClient: () => Redis): RedisClient {
  const getClientWithCall = (): IoredisWithCall => getClient() as IoredisWithCall;

  return {
    scriptLoad(script: string): Promise<string> {
      return getClientWithCall().call('SCRIPT', 'LOAD', script) as Promise<string>;
    },
    evalsha<TArgs extends unknown[], TData = unknown>(sha1: string, keys: string[], args: TArgs): Promise<TData> {
      return getClientWithCall().call('EVALSHA', sha1, keys.length, ...keys, ...(args as (string | number)[])) as Promise<TData>;
    },
    decr(key: string): Promise<number> {
      return getClientWithCall().call('DECR', key) as Promise<number>;
    },
    del(key: string): Promise<number> {
      return getClientWithCall().call('DEL', key) as Promise<number>;
    },
  };
}

/**
 * `RedisStore` loads its Lua scripts in its constructor, which connects Valkey. This builds it when a
 * request first reaches a rate-limited route instead of while routes are built.
 *
 * A store whose constructor could not load its scripts is replaced on the next use: `get` never reloads
 * a script, so it would otherwise keep rejecting after Valkey comes back.
 */
export function createLazyValkeyStore<E extends Env = Env>(getClient: () => Redis) {
  let options: HonoConfigType<E> | undefined;
  let current: { store: RedisStore<E>; loadFailed: boolean } | undefined;

  const resolveStore = () => {
    if (current && !current.loadFailed) return current.store;

    const built = { store: new RedisStore<E>({ client: adaptIoredisForHonoRateLimiter(getClient) }), loadFailed: false };
    if (options) built.store.init(options);
    Promise.all([built.store.incrementScriptSha, built.store.getScriptSha, built.store.decrementScriptSha]).catch(() => {
      built.loadFailed = true;
    });
    current = built;
    return built.store;
  };

  return {
    init(config: HonoConfigType<E>) {
      options = config;
    },
    get: (key: string) => resolveStore().get(key),
    increment: (key: string) => resolveStore().increment(key),
    decrement: (key: string) => resolveStore().decrement(key),
    resetKey: (key: string) => resolveStore().resetKey(key),
  };
}
