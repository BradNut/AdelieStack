import { AUTH_ACCOUNT_SIGN_IN_FAILURES, AuthErrorCode, type AuthRateLimitRule, RETRY_AFTER_HEADER } from '@adelie/shared';
import { BASE_ERROR_CODES } from '@better-auth/core/error';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { m } from '#lib/server/api/common/i18n/index';
import { isRecord } from '#lib/server/api/common/utils/is-record';
import { AuthEndpoint } from './auth.endpoints';

/** Where failed password sign-ins are counted per email address, shared by every API instance. */
export interface AccountLockoutStorage {
  /** Seconds until the address may sign in with a password again, or null while it is under the rule's limit. */
  lockedFor(email: string, rule: AuthRateLimitRule): Promise<number | null>;
  /** Counts one wrong password (or unknown address) in the rule's window. */
  recordFailure(email: string, rule: AuthRateLimitRule): Promise<void>;
  clearFailures(email: string): Promise<void>;
}

const isSignInEmail = (ctx: { path?: string }) => ctx.path === AuthEndpoint.SIGN_IN_EMAIL;

/** The address as Better Auth looks it up (lowercased), or null for a body it will refuse anyway. */
function signInAddress(body: unknown): string | null {
  const email = isRecord(body) ? body.email : undefined;
  return typeof email === 'string' && email.length > 0 ? email.toLowerCase() : null;
}

/**
 * Limits password guesses against one email address however many client addresses they come from. Better Auth's
 * `rateLimit` counts per client IP and path only (ADR 0006), so it never slows a distributed attacker.
 *
 * Wrong passwords and unknown addresses both count, keyed by the address, so the refusal says nothing about whether
 * an account has it. A refused attempt is not counted, so the lock always ends with the window. A correct password
 * clears the count, also when a Second Factor follows: Better Auth's own two-factor lockout covers the codes.
 */
export const accountLockout = (storage: AccountLockoutStorage, rule: AuthRateLimitRule = AUTH_ACCOUNT_SIGN_IN_FAILURES): BetterAuthPlugin => ({
  id: 'account-lockout',
  hooks: {
    before: [
      {
        matcher: isSignInEmail,
        handler: createAuthMiddleware(async (ctx) => {
          const email = signInAddress(ctx.body);
          if (!email) return;
          const retryAfter = await storage.lockedFor(email, rule);
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
          if (returned.body?.code === BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD.code) await storage.recordFailure(email, rule);
        }),
      },
    ],
  },
});
