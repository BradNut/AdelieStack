import { AUTH_SESSION_MAX_LIFETIME } from '@adelie/shared';
import type { BetterAuthOptions } from 'better-auth';

type SessionUpdateBefore = NonNullable<NonNullable<NonNullable<BetterAuthOptions['databaseHooks']>['session']>['update']>['before'];

const MS_PER_SECOND = 1000;

/**
 * `databaseHooks.session.update.before`: holds a session to an absolute lifetime ({@link AUTH_SESSION_MAX_LIFETIME}
 * from sign-in) that use cannot extend (NIST SP 800-63B). Better Auth slides `expiresAt` forward on every refresh, so a
 * refresh is capped at the session's sign-in time plus the lifetime, and refused once that has passed; a refused refresh
 * makes Better Auth drop the cookie and answer unauthorized. The update hook is not given the row, so the session comes
 * from the request, where `getSession` puts it before refreshing; an update with no session there, or one that leaves
 * `expiresAt` alone, is untouched.
 */
export const capSessionLifetime: SessionUpdateBefore = async (session, context) => {
  const createdAt = context?.context.session?.session.createdAt;
  if (!session.expiresAt || !createdAt) return;
  const cap = new Date(new Date(createdAt).getTime() + AUTH_SESSION_MAX_LIFETIME * MS_PER_SECOND);
  if (cap.getTime() <= Date.now()) return false;
  if (new Date(session.expiresAt) <= cap) return;
  return { data: { ...session, expiresAt: cap } };
};
