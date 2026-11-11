import { createHash } from 'node:crypto';
import type { AuthRateLimitRule } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { RedisRepository } from '#lib/server/api/common/factories/redis-repository.factory';
import { RedisService } from '#lib/server/api/databases/redis/redis.service';
import type { AccountLockoutStorage } from './auth.account-lockout';
import type { AuthRateLimitStorage } from './auth.rate-limit';

/** Namespaces the auth rate-limit counters among everything else in Redis. */
export const AUTH_RATE_LIMIT_REDIS_PREFIX = 'auth-rate-limit' as const;

/**
 * The key of an email address's failed sign-in count. Hashed, so Redis holds no email addresses; Better Auth's own
 * keys are a client IP and a path, so they never take this form.
 */
export function accountLockoutKey(email: string) {
  return `account:${createHash('sha256').update(email).digest('hex')}`;
}

/**
 * Rate-limit counters in Redis, shared by every API instance. Plugs into Better Auth as its rate-limit storage (per
 * client IP and path) and into the account lockout (per email address, across clients).
 */
@injectable()
export class AuthRateLimitRepository
  extends RedisRepository<typeof AUTH_RATE_LIMIT_REDIS_PREFIX>
  implements AuthRateLimitStorage, AccountLockoutStorage
{
  constructor(redis = inject(RedisService)) {
    super(AUTH_RATE_LIMIT_REDIS_PREFIX, redis);
  }

  async consume(key: string, rule: AuthRateLimitRule) {
    const { count, ttl } = await this.redis.incrementWithExpiry({ prefix: this.prefix, key, expiry: rule.window });
    if (count <= rule.max) return { allowed: true, retryAfter: null };
    return { allowed: false, retryAfter: ttl > 0 ? ttl : rule.window };
  }

  async lockedFor(email: string, rule: AuthRateLimitRule) {
    const key = accountLockoutKey(email);
    const failures = Number((await this.redis.get({ prefix: this.prefix, key })) ?? 0);
    if (failures < rule.max) return null;
    const ttl = await this.redis.ttl({ prefix: this.prefix, key });
    // Expired between the two reads: the window is over. A count without an expiry is never written.
    return ttl > 0 ? ttl : null;
  }

  async recordFailure(email: string, rule: AuthRateLimitRule) {
    await this.redis.incrementWithExpiry({ prefix: this.prefix, key: accountLockoutKey(email), expiry: rule.window });
  }

  async clearFailures(email: string) {
    await this.redis.delete({ prefix: this.prefix, key: accountLockoutKey(email) });
  }
}
