import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware, freshSessionMiddleware, getSessionFromCtx } from 'better-auth/api';
import { AuthEndpoint } from './auth.endpoints';

/**
 * Admin plugin endpoints that change another account. Better Auth checks only the caller's role on them, so an admin
 * session of any age, kept alive by use, could otherwise run them. Impersonation is here too; stopping it is not, as
 * that session belongs to the impersonated user and only hands the admin's back.
 */
export const FRESH_SESSION_ADMIN_PATHS: readonly string[] = [
  AuthEndpoint.ADMIN_CREATE_USER,
  AuthEndpoint.ADMIN_UPDATE_USER,
  AuthEndpoint.ADMIN_SET_ROLE,
  AuthEndpoint.ADMIN_SET_USER_PASSWORD,
  AuthEndpoint.ADMIN_BAN_USER,
  AuthEndpoint.ADMIN_UNBAN_USER,
  AuthEndpoint.ADMIN_REMOVE_USER,
  AuthEndpoint.ADMIN_IMPERSONATE_USER,
  AuthEndpoint.ADMIN_REVOKE_USER_SESSION,
  AuthEndpoint.ADMIN_REVOKE_USER_SESSIONS,
];

/**
 * Holds two kinds of request to a fresh session (`AUTH_SESSION_FRESH_AGE`) with Better Auth's own check, so a stale
 * session gets its `SESSION_NOT_FRESH` and the web app's re-authentication flow handles it. Both run before the
 * endpoint, so a refused request changes nothing and sends no email. A plugin hook because the top-level
 * `hooks.before` slot is taken by the password policy.
 *
 * - Starting an email change, which Better Auth allows from any live session: the confirmation goes to the new address,
 *   so a stolen session could otherwise move the account to an attacker's email and then reset its password. No
 *   session gets Better Auth's `UNAUTHORIZED`.
 * - The admin actions in {@link FRESH_SESSION_ADMIN_PATHS}. A call with no session (the seed, server-side calls) is
 *   left to the admin plugin, which allows it on the server and refuses it over HTTP.
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
      {
        matcher: (ctx) => FRESH_SESSION_ADMIN_PATHS.includes(ctx.path ?? ''),
        handler: createAuthMiddleware(async (ctx) => {
          if (!(await getSessionFromCtx(ctx))) return;
          await freshSessionMiddleware(ctx);
        }),
      },
    ],
  },
});
