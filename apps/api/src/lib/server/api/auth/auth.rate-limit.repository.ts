import { inject, injectable } from '@needle-di/core';
import { RedisRepository } from '#lib/server/api/common/factories/redis-repository.factory';
import { RedisService } from '#lib/server/api/databases/redis/redis.service';
import type { AuthRateLimitStorage } from './auth.rate-limit';

/** Namespaces the auth rate-limit counters among everything else in Redis. */
export const AUTH_RATE_LIMIT_REDIS_PREFIX = 'auth-rate-limit' as const;

/** Rate-limit counters in Redis, shared by every API instance. Plugs into Better Auth as its rate-limit storage. */
@injectable()
export class AuthRateLimitRepository extends RedisRepository<typeof AUTH_RATE_LIMIT_REDIS_PREFIX> implements AuthRateLimitStorage {
  constructor(redis = inject(RedisService)) {
    super(AUTH_RATE_LIMIT_REDIS_PREFIX, redis);
  }

  async consume(key: string, rule: { window: number; max: number }) {
    const { count, ttl } = await this.redis.incrementWithExpiry({ prefix: this.prefix, key, expiry: rule.window });
    if (count <= rule.max) return { allowed: true, retryAfter: null };
    return { allowed: false, retryAfter: ttl > 0 ? ttl : rule.window };
  }
}
