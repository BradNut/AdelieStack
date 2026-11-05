import { AuthErrorCode, CREDENTIAL_PROVIDER_ID } from '@adelie/shared';
import { APIError, type AuthMiddleware, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { m } from '#lib/server/api/common/i18n/index';

/** The Better Auth endpoint that removes one of the signed-in user's Sign-in Accounts. */
export const UNLINK_ACCOUNT_PATH = '/unlink-account';

function unlinkedAccountId(body: unknown): unknown {
  return typeof body === 'object' && body !== null && 'accountId' in body ? body.accountId : undefined;
}

/**
 * Before hook that refuses to unlink the Password Account while the user has two-factor enabled, so they
 * can always re-authenticate with their password and a Second Factor, and can still disable two-factor
 * (ADR 0008). Every other unlink, including an unknown account id, goes to Better Auth unchanged. Runs
 * before Better Auth's fresh-session check, so a stale session gets this refusal, not `SESSION_NOT_FRESH`.
 * Register it with a matcher on `UNLINK_ACCOUNT_PATH`; it does not check the path itself.
 */
export function createPasswordAccountGuard(): AuthMiddleware {
  return createAuthMiddleware(async (ctx) => {
    const session = await getSessionFromCtx<{ twoFactorEnabled?: boolean | null }>(ctx);
    if (!session?.user.twoFactorEnabled) return;
    const accountId = unlinkedAccountId(ctx.body);
    const accounts = await ctx.context.internalAdapter.findAccounts(session.user.id);
    const unlinked = accounts.find((account) => account.id === accountId);
    if (unlinked?.providerId === CREDENTIAL_PROVIDER_ID) {
      throw new APIError('BAD_REQUEST', {
        code: AuthErrorCode.PASSWORD_REQUIRED_FOR_TWO_FACTOR,
        message: m.auth_password_required_for_two_factor(),
      });
    }
  });
}
