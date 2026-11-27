import type { EscalatingLockoutPolicy } from '@adelie/shared';

// No imports beyond the shared policy type: the lockout storage depends on this, and must load without the auth plugin.

/**
 * Seconds the address is locked for once `failures` consecutive failures are counted, or null when that failure does
 * not lock it. The nth lock lasts the nth of `policy.lockDurationsSeconds`, and the last repeats.
 */
export function lockDurationAfter(policy: EscalatingLockoutPolicy, failures: number): number | null {
  if (failures <= 0 || failures % policy.maxFailedAttempts !== 0) return null;
  const durations = policy.lockDurationsSeconds;
  return durations[Math.min(failures / policy.maxFailedAttempts, durations.length) - 1] ?? null;
}
