import { type AccountLockoutPolicy, AUTH_ACCOUNT_SIGN_IN_LOCKOUT, AuthErrorCode, RETRY_AFTER_HEADER } from '@adelie/shared';
import { BASE_ERROR_CODES } from '@better-auth/core/error';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { m } from '#lib/server/api/common/i18n/index';
import { isRecord } from '#lib/server/api/common/utils/is-record';
import { AuthEndpoint } from './auth.endpoints';

/** The account-lockout plugin's id among Better Auth's plugins. */
export const ACCOUNT_LOCKOUT_PLUGIN_ID = 'account-lockout' as const;

/**
 * Where failed password sign-ins are counted per email address, shared by every API instance. Implementations
 * normalise the address (lowercase), as Better Auth does when it looks the account up.
 */
export interface AccountLockoutStorage {
  /** Seconds until the address may sign in with a password again, or null while it is not locked. */
  lockedFor(email: string): Promise<number | null>;
  /**
   * Counts one wrong password (or unknown address). The failure that reaches `policy.maxFailedAttempts` locks the
   * address for `policy.durationSeconds` and starts the count again.
   */
  recordFailure(email: string, policy: AccountLockoutPolicy): Promise<void>;
  clearFailures(email: string): Promise<void>;
}

const isSignInEmail = (ctx: { path?: string }) => ctx.path === AuthEndpoint.SIGN_IN_EMAIL;

/** The address the request signs in with, or null for a body Better Auth will refuse anyway. */
function signInAddress(body: unknown): string | null {
  const email = isRecord(body) ? body.email : undefined;
  return typeof email === 'string' && email.length > 0 ? email : null;
}

/**
 * Limits password guesses against one email address however many client addresses they come from. Better Auth's
 * `rateLimit` counts per client IP and path only (ADR 0006), so it never slows a distributed attacker.
 *
 * Failures count consecutively until a correct password clears them, however slowly they come. The failure that
 * reaches the maximum locks the address for the policy's duration; refused attempts are not counted and never extend
 * it, and the count starts again when it ends, so a lockout is never permanent. Wrong passwords and unknown addresses
 * both count, keyed by the address, so the refusal says nothing about whether an account has it. A correct password
 * clears the count also when a Second Factor follows: Better Auth's own two-factor lockout covers the codes.
 */
export const accountLockout = (storage: AccountLockoutStorage, policy: AccountLockoutPolicy = AUTH_ACCOUNT_SIGN_IN_LOCKOUT): BetterAuthPlugin => ({
  id: ACCOUNT_LOCKOUT_PLUGIN_ID,
  hooks: {
    before: [
      {
        matcher: isSignInEmail,
        handler: createAuthMiddleware(async (ctx) => {
          const email = signInAddress(ctx.body);
          if (!email) return;
          // A storage failure throws here, so the sign-in fails rather than going unlimited.
          const retryAfter = await storage.lockedFor(email);
          if (retryAfter === null) return;
          throw new APIError(
            'TOO_MANY_REQUESTS',
            { code: AuthErrorCode.SIGN_IN_LOCKED, message: m.auth_sign_in_locked() },
            { [RETRY_AFTER_HEADER]: String(retryAfter) },
          );
        }),
      },
    ],
    after: [
      {
        matcher: isSignInEmail,
        handler: createAuthMiddleware(async (ctx) => {
          const email = signInAddress(ctx.body);
          if (!email) return;
          const returned = ctx.context.returned;
          if (!isAPIError(returned)) {
            await storage.clearFailures(email);
            return;
          }
          // Only a refused credential counts: not a malformed request, nor an unverified email after a correct password.
          if (returned.body?.code === BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD.code) await storage.recordFailure(email, policy);
        }),
      },
    ],
  },
});
