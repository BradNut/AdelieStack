import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware, freshSessionMiddleware } from 'better-auth/api';
import { AuthEndpoint } from './auth.endpoints';

/**
 * Holds starting an email change, which Better Auth allows from any live session, to a fresh one
 * (`AUTH_SESSION_FRESH_AGE`): the confirmation goes to the new address, so a stolen session could otherwise move the
 * account to an attacker's email and then reset its password. A stale session gets Better Auth's own
 * `SESSION_NOT_FRESH` (and no session its `UNAUTHORIZED`), the same check its fresh-session endpoints run, so the web
 * app's re-authentication flow handles it. Runs before the endpoint, so a refused request sends no email. A plugin hook
 * because the top-level `hooks.before` slot is taken by the password policy.
 */
export const freshSessionGuard = (): BetterAuthPlugin => ({
  id: 'fresh-session-guard',
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === AuthEndpoint.CHANGE_EMAIL,
        // Called rather than passed as the handler: a before hook that returns a value answers the request with it.
        handler: createAuthMiddleware(async (ctx) => {
          await freshSessionMiddleware(ctx);
        }),
      },
    ],
  },
});
