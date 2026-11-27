import { createHash } from 'node:crypto';
import { AUTH_ACCOUNT_SIGN_IN_FAILURES_IDLE_EXPIRY, type AuthRateLimitRule, type EscalatingLockoutPolicy } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { ValkeyRepository } from '#lib/server/api/common/factories/valkey-repository.factory';
import { ValkeyService } from '#lib/server/api/databases/valkey/valkey.service';
import type { AccountLockoutStorage } from './auth.account-lockout';
import { lockDurationAfter } from './auth.lockout-policy';
import type { AuthRateLimitStorage } from './auth.rate-limit';

/** Namespaces the auth rate-limit counters among everything else in Valkey. */
export const AUTH_RATE_LIMIT_VALKEY_PREFIX = 'auth-rate-limit' as const;

/** The Valkey keys of one email address's account lockout. */
export interface AccountLockoutKeys {
  /** Consecutive failed sign-ins since the last success, kept through locks so it also counts them. */
  failures: string;
  /** Present while the address is locked; expires when the lock ends. */
  lock: string;
}

/**
 * The keys of an email address's account lockout, for the address lowercased as Better Auth looks it up. Hashed, so
 * Valkey holds no email addresses; Better Auth's own keys are a client IP and a path, so they never take this form.
 */
export function accountLockoutKeys(email: string): AccountLockoutKeys {
  const hash = createHash('sha256').update(email.toLowerCase()).digest('hex');
  return { failures: `account:${hash}`, lock: `account-locked:${hash}` };
}

/**
 * Auth throttling state in Valkey, shared by every API instance. One class for two concerns that share the prefix and
 * the connection: Better Auth's rate-limit storage (fixed-window counters per client IP and path) and the account
 * lockout (consecutive failed password sign-ins per email address, across clients, with escalating locks).
 */
@injectable()
export class AuthRateLimitRepository
  extends ValkeyRepository<typeof AUTH_RATE_LIMIT_VALKEY_PREFIX>
  implements AuthRateLimitStorage, AccountLockoutStorage
{
  constructor(valkey = inject(ValkeyService)) {
    super(AUTH_RATE_LIMIT_VALKEY_PREFIX, valkey);
  }

  async consume(key: string, rule: AuthRateLimitRule) {
    const { count, ttl } = await this.valkey.incrementWithExpiry({ prefix: this.prefix, key, expiry: rule.window });
    if (count <= rule.max) return { allowed: true, retryAfter: null };
    return { allowed: false, retryAfter: ttl > 0 ? ttl : rule.window };
  }

  async lockedFor(email: string): Promise<number | null> {
    const ttl = await this.valkey.ttl({ prefix: this.prefix, key: accountLockoutKeys(email).lock });
    // -2 means no lock. A lock is always written with an expiry, so -1 does not occur.
    return ttl > 0 ? ttl : null;
  }

  async recordFailure(email: string, policy: EscalatingLockoutPolicy): Promise<void> {
    const keys = accountLockoutKeys(email);
    // Far longer than the longest lock, so the count (and the lock history it holds) resets only on a success or a
    // day without failures.
    const failures = await this.valkey.incrementWithIdleExpiry({
      prefix: this.prefix,
      key: keys.failures,
      expiry: AUTH_ACCOUNT_SIGN_IN_FAILURES_IDLE_EXPIRY,
    });
    const lockSeconds = lockDurationAfter(policy, failures);
    if (lockSeconds === null) return;
    // Locked for the full duration from this failure.
    await this.valkey.setWithExpiry({ prefix: this.prefix, key: keys.lock, value: String(failures), expiry: lockSeconds });
  }

  async clearFailures(email: string): Promise<void> {
    await this.valkey.delete({ prefix: this.prefix, key: accountLockoutKeys(email).failures });
  }
}
