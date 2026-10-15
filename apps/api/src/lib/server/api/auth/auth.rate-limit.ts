import { AUTH_RATE_LIMIT_DEFAULT, AUTH_RATE_LIMIT_RULES } from '@adelie/shared';
import type { BetterAuthOptions } from 'better-auth';
import type { Redis } from 'ioredis';

type RateLimitOptions = NonNullable<BetterAuthOptions['rateLimit']>;

/** Where Better Auth keeps its rate-limit counters. */
export type AuthRateLimitStorage = NonNullable<RateLimitOptions['customStorage']>;

/** Namespaces the counters among everything else in Redis. */
export const AUTH_RATE_LIMIT_REDIS_PREFIX = 'auth-rate-limit:';

/**
 * Counts one request in a fixed window and returns the count with the seconds left in the window.
 * One script so that counting and starting the window's expiry cannot be split by a crash.
 */
const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('TTL', KEYS[1]) }
`;

/**
 * Rate-limit counters in Redis, shared by every API instance. Takes a getter so the connection is
 * opened on the first request, never at import or construction time.
 */
export function createRedisRateLimitStorage(getRedis: () => Pick<Redis, 'eval'>): AuthRateLimitStorage {
  return {
    async consume(key, rule) {
      const [count, ttl] = (await getRedis().eval(CONSUME_SCRIPT, 1, `${AUTH_RATE_LIMIT_REDIS_PREFIX}${key}`, rule.window)) as [number, number];
      if (count <= rule.max) return { allowed: true, retryAfter: null };
      return { allowed: false, retryAfter: ttl > 0 ? ttl : rule.window };
    },
  };
}

/**
 * Better Auth's `rateLimit` option over the given storage; without one, rate limiting is off. Both
 * states are explicit, because the library enables itself in production only and would otherwise
 * fall back to per-process memory.
 */
export function authRateLimitOptions(storage?: AuthRateLimitStorage): RateLimitOptions {
  if (!storage) return { enabled: false };
  return {
    enabled: true,
    ...AUTH_RATE_LIMIT_DEFAULT,
    customStorage: storage,
    customRules: { ...AUTH_RATE_LIMIT_RULES },
  };
}
