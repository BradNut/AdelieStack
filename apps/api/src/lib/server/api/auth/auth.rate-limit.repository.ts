import { createHash } from 'node:crypto';
import { type AccountLockoutPolicy, AUTH_ACCOUNT_SIGN_IN_FAILURES_IDLE_EXPIRY, type AuthRateLimitRule } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { RedisRepository } from '#lib/server/api/common/factories/redis-repository.factory';
import { RedisService } from '#lib/server/api/databases/redis/redis.service';
import type { AccountLockoutStorage } from './auth.account-lockout';
import type { AuthRateLimitStorage } from './auth.rate-limit';

/** Namespaces the auth rate-limit counters among everything else in Redis. */
export const AUTH_RATE_LIMIT_REDIS_PREFIX = 'auth-rate-limit' as const;

/** The Redis keys of one email address's account lockout. */
export interface AccountLockoutKeys {
  /** Consecutive failed sign-ins since the last success or lock. */
  failures: string;
  /** Present while the address is locked; expires when the lock ends. */
  lock: string;
}

/**
 * The keys of an email address's account lockout, for the address lowercased as Better Auth looks it up. Hashed, so
 * Redis holds no email addresses; Better Auth's own keys are a client IP and a path, so they never take this form.
 */
export function accountLockoutKeys(email: string): AccountLockoutKeys {
  const hash = createHash('sha256').update(email.toLowerCase()).digest('hex');
  return { failures: `account:${hash}`, lock: `account-locked:${hash}` };
}

/**
 * Auth throttling state in Redis, shared by every API instance. One class for two concerns that share the prefix and
 * the connection: Better Auth's rate-limit storage (fixed-window counters per client IP and path) and the account
 * lockout (consecutive failed password sign-ins per email address, across clients).
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

  async lockedFor(email: string): Promise<number | null> {
    const ttl = await this.redis.ttl({ prefix: this.prefix, key: accountLockoutKeys(email).lock });
    // -2 means no lock. A lock is always written with an expiry, so -1 does not occur.
    return ttl > 0 ? ttl : null;
  }

  async recordFailure(email: string, policy: AccountLockoutPolicy): Promise<void> {
    const keys = accountLockoutKeys(email);
    // Far longer than the lock, so the count resets only on a success or a lock; the expiry just drops idle counts.
    const failures = await this.redis.incrementWithIdleExpiry({
      prefix: this.prefix,
      key: keys.failures,
      expiry: AUTH_ACCOUNT_SIGN_IN_FAILURES_IDLE_EXPIRY,
    });
    if (failures < policy.maxFailedAttempts) return;
    // Locked for the full duration from this failure; the count then starts again, as in Better Auth's two-factor lockout.
    await this.redis.setWithExpiry({ prefix: this.prefix, key: keys.lock, value: String(failures), expiry: policy.durationSeconds });
    await this.redis.delete({ prefix: this.prefix, key: keys.failures });
  }

  async clearFailures(email: string): Promise<void> {
    await this.redis.delete({ prefix: this.prefix, key: accountLockoutKeys(email).failures });
  }
}
