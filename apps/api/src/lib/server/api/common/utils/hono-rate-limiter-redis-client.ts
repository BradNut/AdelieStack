import type { Env, Input } from 'hono';
import { type HonoConfigType, type RedisClient, RedisStore } from 'hono-rate-limiter';
import type Redis from 'ioredis';

type IoredisWithCall = Redis & {
  call: (...args: (string | number)[]) => Promise<unknown>;
};

/**
 * Wraps an ioredis client so it satisfies the `RedisClient` interface
 * expected by `hono-rate-limiter`'s `RedisStore`. Redis commands are sent
 * through `ioredis.call(...)` to avoid the missing type declaration issue.
 */
export function adaptIoredisForHonoRateLimiter(getRedis: () => Redis): RedisClient {
  const getRedisWithCall = (): IoredisWithCall => getRedis() as IoredisWithCall;

  return {
    scriptLoad(script: string): Promise<string> {
      return getRedisWithCall().call('SCRIPT', 'LOAD', script) as Promise<string>;
    },
    evalsha<TArgs extends unknown[], TData = unknown>(sha1: string, keys: string[], args: TArgs): Promise<TData> {
      return getRedisWithCall().call('EVALSHA', sha1, keys.length, ...keys, ...(args as (string | number)[])) as Promise<TData>;
    },
    decr(key: string): Promise<number> {
      return getRedisWithCall().call('DECR', key) as Promise<number>;
    },
    del(key: string): Promise<number> {
      return getRedisWithCall().call('DEL', key) as Promise<number>;
    },
  };
}

/**
 * `RedisStore` loads its Lua scripts in its constructor, which connects Redis. This builds it when a
 * request first reaches a rate-limited route instead of while routes are built.
 *
 * A store whose constructor could not load its scripts is replaced on the next use: `get` never reloads
 * a script, so it would otherwise keep rejecting after Redis comes back.
 */
export function createLazyRedisStore<E extends Env = Env, P extends string = string, I extends Input = Input>(getRedis: () => Redis) {
  let options: HonoConfigType<E, P, I> | undefined;
  let current: { store: RedisStore<E, P, I>; loadFailed: boolean } | undefined;

  const store = () => {
    if (current && !current.loadFailed) return current.store;

    const built = { store: new RedisStore<E, P, I>({ client: adaptIoredisForHonoRateLimiter(getRedis) }), loadFailed: false };
    if (options) built.store.init(options);
    Promise.all([built.store.incrementScriptSha, built.store.getScriptSha, built.store.decrementScriptSha]).catch(() => {
      built.loadFailed = true;
    });
    current = built;
    return built.store;
  };

  return {
    init(config: HonoConfigType<E, P, I>) {
      options = config;
    },
    get: (key: string) => store().get(key),
    increment: (key: string) => store().increment(key),
    decrement: (key: string) => store().decrement(key),
    resetKey: (key: string) => store().resetKey(key),
  };
}
