import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware, freshSessionMiddleware } from 'better-auth/api';
import { AuthEndpoint } from './auth.endpoints';

/**
 * Sensitive endpoints Better Auth guards with any live session, which we hold to a fresh one (`AUTH_SESSION_FRESH_AGE`).
 * Starting an email change sends the confirmation to the new address, so a stolen session could otherwise move the
 * account to an attacker's email and then reset its password.
 */
const FRESH_SESSION_ENDPOINTS: ReadonlySet<string> = new Set([AuthEndpoint.CHANGE_EMAIL]);

/**
 * Refuses {@link FRESH_SESSION_ENDPOINTS} from a session older than the fresh age with Better Auth's own
 * `SESSION_NOT_FRESH` (and no session with its `UNAUTHORIZED`), the same check its fresh-session endpoints run, so the
 * web app's re-authentication flow handles it. Runs before the endpoint, so a refused request sends no email. A plugin
 * hook because the top-level `hooks.before` slot is taken by the password policy.
 */
export const freshSessionGuard = (): BetterAuthPlugin => ({
  id: 'fresh-session-guard',
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path !== undefined && FRESH_SESSION_ENDPOINTS.has(ctx.path),
        // Called rather than passed as the handler: a before hook that returns a value answers the request with it.
        handler: createAuthMiddleware(async (ctx) => {
          await freshSessionMiddleware(ctx);
        }),
      },
    ],
  },
});
