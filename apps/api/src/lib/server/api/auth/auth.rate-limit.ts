import { AUTH_RATE_LIMIT_DEFAULT, AUTH_RATE_LIMIT_RULES } from '@adelie/shared';
import type { BetterAuthOptions } from 'better-auth';

type RateLimitOptions = NonNullable<BetterAuthOptions['rateLimit']>;

/** Where Better Auth keeps its rate-limit counters. */
export type AuthRateLimitStorage = NonNullable<RateLimitOptions['customStorage']>;

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
