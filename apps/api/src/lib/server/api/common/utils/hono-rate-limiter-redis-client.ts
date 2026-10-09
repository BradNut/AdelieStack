import type { RedisClient } from 'hono-rate-limiter';
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
