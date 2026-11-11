import { AuthErrorCode, roleNeedsSecondFactor } from '@adelie/shared';
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

/** Admin plugin endpoints that write the user row from a free-form `data` record. */
const USER_DATA_WRITE_PATHS: readonly string[] = [AuthEndpoint.ADMIN_CREATE_USER, AuthEndpoint.ADMIN_UPDATE_USER];

/**
 * User fields that record a Second Factor. Only the owner's own enrolment writes them; the admin plugin passes `data`
 * to the user row unchecked, so an admin could otherwise mark an account enrolled or clear another admin's two-factor.
 */
const SECOND_FACTOR_USER_FIELDS: readonly string[] = ['twoFactorEnabled'];

/** Reads the passkey rows; the adapter of a Better Auth context. */
export type PasskeyReader = Pick<AuthContext['adapter'], 'findMany'>;

/** What the check needs of a user. */
export interface SecondFactorUser {
  id: string;
  twoFactorEnabled?: boolean | null;
}

/** A session user as the hooks read it: the Second Factor fields plus the stored role. */
interface SessionUser extends SecondFactorUser {
  role?: string | null;
}

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

async function passkeyIdsOf(adapter: PasskeyReader, userId: string): Promise<string[]> {
  const rows = await adapter.findMany<{ id: string }>({ model: PASSKEY_MODEL, where: [{ field: 'userId', value: userId }] });
  return rows.map((row) => row.id);
}

/** Whether the account has a Second Factor: enabled two-factor or at least one registered passkey (ADR 0014). */
export async function hasSecondFactor(adapter: PasskeyReader, user: SecondFactorUser): Promise<boolean> {
  if (user.twoFactorEnabled === true) return true;
  return (await passkeyIdsOf(adapter, user.id)).length > 0;
}

/** Whether any of `roles` needs a Second Factor. */
export function rolesNeedSecondFactor(roles: readonly string[]): boolean {
  return roles.some(roleNeedsSecondFactor);
}

/**
 * The signed-in user, when their stored role holds one that needs a Second Factor; otherwise `null` (no session, or
 * a role that does not). The role is read unnarrowed, because Better Auth's admin plugin authorises its endpoints with
 * the stored value as it is (ADR 0014).
 */
async function sessionUserNeedingSecondFactor(ctx: HookContext): Promise<SessionUser | null> {
  const session = await getSessionFromCtx<SessionUser>(ctx);
  if (!session || !rolesNeedSecondFactor(storedRoleNames(session.user.role))) return null;
  return session.user;
}

function writesSecondFactor(body: unknown): boolean {
  if (!isRecord(body) || !isRecord(body.data)) return false;
  const data = body.data;
  return SECOND_FACTOR_USER_FIELDS.some((field) => Object.hasOwn(data, field));
}

function secondFactorRequired(): APIError {
  return new APIError('FORBIDDEN', { code: AuthErrorCode.SECOND_FACTOR_REQUIRED, message: m.auth_second_factor_required() });
}

function lastSecondFactor(): APIError {
  return new APIError('BAD_REQUEST', { code: AuthErrorCode.LAST_SECOND_FACTOR, message: m.auth_last_second_factor() });
}

function secondFactorNotWritable(): APIError {
  return new APIError('BAD_REQUEST', { code: AuthErrorCode.SECOND_FACTOR_NOT_WRITABLE, message: m.auth_second_factor_not_writable() });
}

/**
 * Admin capabilities need a Second Factor (ADR 0014). Refuses the admin plugin's endpoints to a signed-in admin
 * without one, with `SECOND_FACTOR_REQUIRED`; signing in and enrolling are untouched. Refuses, with
 * `LAST_SECOND_FACTOR`, disabling two-factor or deleting a passkey when that would leave an admin without one.
 * Refuses, with `SECOND_FACTOR_NOT_WRITABLE`, an admin create or update that sets a Second Factor field, whoever calls
 * it. A call without a session (the seed, server-side checks) and every other role otherwise go to Better Auth
 * unchanged. A plugin hook because the top-level `hooks.before` slot is taken by the password policy.
 */
export const secondFactorGuard = (): BetterAuthPlugin => ({
  id: 'second-factor-guard',
  hooks: {
    before: [
      {
        matcher: (ctx) => (ctx.path ?? '').startsWith(ADMIN_PATH_PREFIX) && !UNGUARDED_ADMIN_PATHS.includes(ctx.path ?? ''),
        handler: createAuthMiddleware(async (ctx) => {
          const user = await sessionUserNeedingSecondFactor(ctx);
          if (user && !(await hasSecondFactor(ctx.context.adapter, user))) throw secondFactorRequired();
        }),
      },
      {
        matcher: (ctx) => USER_DATA_WRITE_PATHS.includes(ctx.path ?? ''),
        handler: createAuthMiddleware(async (ctx) => {
          if (writesSecondFactor(ctx.body)) throw secondFactorNotWritable();
        }),
      },
      {
        matcher: (ctx) => ctx.path === AuthEndpoint.TWO_FACTOR_DISABLE,
        handler: createAuthMiddleware(async (ctx) => {
          const user = await sessionUserNeedingSecondFactor(ctx);
          if (!user?.twoFactorEnabled) return;
          // What would remain once two-factor is off.
          if (!(await hasSecondFactor(ctx.context.adapter, { id: user.id, twoFactorEnabled: false }))) throw lastSecondFactor();
        }),
      },
      {
        matcher: (ctx) => ctx.path === AuthEndpoint.PASSKEY_DELETE,
        handler: createAuthMiddleware(async (ctx) => {
          const user = await sessionUserNeedingSecondFactor(ctx);
          if (!user || user.twoFactorEnabled) return;
          const deleted = isRecord(ctx.body) ? ctx.body.id : undefined;
          const passkeys = await passkeyIdsOf(ctx.context.adapter, user.id);
          // Another user's or an unknown id is left to the passkey plugin's own ownership check.
          if (passkeys.length === 1 && passkeys[0] === deleted) throw lastSecondFactor();
        }),
      },
    ],
  },
});
