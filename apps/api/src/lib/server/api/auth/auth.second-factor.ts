import { AuthErrorCode, SECOND_FACTOR_ROLES } from '@adelie/shared';
import type { AuthContext, BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { m } from '#lib/server/api/common/i18n/index';
import { isRecord } from '#lib/server/api/common/utils/is-record';
import { AuthEndpoint } from './auth.endpoints';
import { storedRoleNames } from './roles';

/** The Better Auth model passkeys are stored under. */
const PASSKEY_MODEL = 'passkey';

/** The admin plugin's path prefix; every endpoint under it is an admin capability unless listed in {@link UNGUARDED_ADMIN_PATHS}. */
const ADMIN_PATH_PREFIX = '/admin/';

/**
 * Admin plugin endpoints that exercise no admin capability: checking one's own permissions, and ending an
 * impersonation (whose session belongs to the impersonated user).
 */
const UNGUARDED_ADMIN_PATHS: readonly string[] = [AuthEndpoint.ADMIN_HAS_PERMISSION, AuthEndpoint.ADMIN_STOP_IMPERSONATING];

/** Reads the passkey rows; the adapter of a Better Auth context. */
export type PasskeyReader = Pick<AuthContext['adapter'], 'findMany'>;

/** What the check needs of a user. */
export interface SecondFactorUser {
  id: string;
  twoFactorEnabled?: boolean | null;
}

async function passkeyIdsOf(adapter: PasskeyReader, userId: string): Promise<string[]> {
  const rows = await adapter.findMany<{ id: string }>({ model: PASSKEY_MODEL, where: [{ field: 'userId', value: userId }] });
  return rows.map((row) => row.id);
}

/** Whether the account has a Second Factor: enabled two-factor or at least one registered passkey (ADR 0013). */
export async function hasSecondFactor(adapter: PasskeyReader, user: SecondFactorUser): Promise<boolean> {
  if (user.twoFactorEnabled === true) return true;
  return (await passkeyIdsOf(adapter, user.id)).length > 0;
}

/** Whether any of `roles` needs a Second Factor. */
export function rolesNeedSecondFactor(roles: readonly string[]): boolean {
  return roles.some((role) => SECOND_FACTOR_ROLES.some((needing) => needing === role));
}

/**
 * Whether the stored role value holds a role that needs a Second Factor. Read unnarrowed, because Better Auth's admin
 * plugin authorises its endpoints with the stored value as it is.
 */
function storedRoleNeedsSecondFactor(stored: string | null | undefined): boolean {
  return rolesNeedSecondFactor(storedRoleNames(stored));
}

function secondFactorRequired(): APIError {
  return new APIError('FORBIDDEN', { code: AuthErrorCode.SECOND_FACTOR_REQUIRED, message: m.auth_second_factor_required() });
}

function lastSecondFactor(): APIError {
  return new APIError('BAD_REQUEST', { code: AuthErrorCode.LAST_SECOND_FACTOR, message: m.auth_last_second_factor() });
}

type SessionUser = SecondFactorUser & { role?: string | null };

/**
 * Admin capabilities need a Second Factor (ADR 0013). Refuses the admin plugin's endpoints to a signed-in admin
 * without one, with `SECOND_FACTOR_REQUIRED`; signing in and enrolling are untouched. Refuses, with
 * `LAST_SECOND_FACTOR`, disabling two-factor or deleting a passkey when that would leave an admin without one. A call
 * without a session (the seed, server-side checks) and every other role go to Better Auth unchanged. A plugin hook
 * because the top-level `hooks.before` slot is taken by the password policy.
 */
export const secondFactorGuard = (): BetterAuthPlugin => ({
  id: 'second-factor-guard',
  hooks: {
    before: [
      {
        matcher: (ctx) => (ctx.path ?? '').startsWith(ADMIN_PATH_PREFIX) && !UNGUARDED_ADMIN_PATHS.includes(ctx.path ?? ''),
        handler: createAuthMiddleware(async (ctx) => {
          const session = await getSessionFromCtx<SessionUser>(ctx);
          if (!session || !storedRoleNeedsSecondFactor(session.user.role)) return;
          if (await hasSecondFactor(ctx.context.adapter, session.user)) return;
          throw secondFactorRequired();
        }),
      },
      {
        matcher: (ctx) => ctx.path === AuthEndpoint.TWO_FACTOR_DISABLE,
        handler: createAuthMiddleware(async (ctx) => {
          const session = await getSessionFromCtx<SessionUser>(ctx);
          if (!session?.user.twoFactorEnabled || !storedRoleNeedsSecondFactor(session.user.role)) return;
          if ((await passkeyIdsOf(ctx.context.adapter, session.user.id)).length === 0) throw lastSecondFactor();
        }),
      },
      {
        matcher: (ctx) => ctx.path === AuthEndpoint.PASSKEY_DELETE,
        handler: createAuthMiddleware(async (ctx) => {
          const session = await getSessionFromCtx<SessionUser>(ctx);
          if (!session || session.user.twoFactorEnabled || !storedRoleNeedsSecondFactor(session.user.role)) return;
          const deleted = isRecord(ctx.body) ? ctx.body.id : undefined;
          const passkeys = await passkeyIdsOf(ctx.context.adapter, session.user.id);
          // Another user's or an unknown id is left to the passkey plugin's own ownership check.
          if (passkeys.length === 1 && passkeys[0] === deleted) throw lastSecondFactor();
        }),
      },
    ],
  },
});
