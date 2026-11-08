import { AuthErrorCode, CREDENTIAL_PROVIDER_ID } from '@adelie/shared';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { m } from '#lib/server/api/common/i18n/index';
import { isRecord } from '#lib/server/api/common/utils/is-record';
import { AuthEndpoint } from './auth.endpoints';

/**
 * Refuses to unlink the Password Account while the user has two-factor enabled, so they can always re-authenticate
 * with their password and a Second Factor, and can still disable two-factor (ADR 0008). Every other unlink, including
 * an unknown account id, goes to Better Auth unchanged. Runs before Better Auth's fresh-session check, so a stale
 * session gets this refusal, not `SESSION_NOT_FRESH`. A plugin hook because the top-level `hooks.before` slot is taken
 * by the password policy.
 */
export const passwordAccountGuard = (): BetterAuthPlugin => ({
  id: 'password-account-guard',
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === AuthEndpoint.UNLINK_ACCOUNT,
        handler: createAuthMiddleware(async (ctx) => {
          const session = await getSessionFromCtx<{ twoFactorEnabled?: boolean | null }>(ctx);
          if (!session?.user.twoFactorEnabled) return;
          const accountId = isRecord(ctx.body) ? ctx.body.accountId : undefined;
          const accounts = await ctx.context.internalAdapter.findAccounts(session.user.id);
          const unlinked = accounts.find((account) => account.id === accountId);
          if (unlinked?.providerId === CREDENTIAL_PROVIDER_ID) {
            throw new APIError('BAD_REQUEST', {
              code: AuthErrorCode.PASSWORD_REQUIRED_FOR_TWO_FACTOR,
              message: m.auth_password_required_for_two_factor(),
            });
          }
        }),
      },
    ],
  },
});
