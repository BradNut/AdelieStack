import type { BetterAuthOptions } from 'better-auth';
import { isRecord } from '#lib/server/api/common/utils/is-record';
import { AuthEndpoint } from './auth.endpoints';

type UserCreateBefore = NonNullable<NonNullable<NonNullable<BetterAuthOptions['databaseHooks']>['user']>['create']>['before'];

/** The `emailVerified` an admin's create-user body sets in its `data`, or undefined when it leaves it out. */
function requestedEmailVerified(body: unknown): unknown {
  return isRecord(body) && isRecord(body.data) ? body.data.emailVerified : undefined;
}

/**
 * `databaseHooks.user.create.before`: a user the admin plugin creates (the seed, or an admin over HTTP) starts with a
 * verified email, so it can sign in while `requireEmailVerification` refuses unverified accounts. An administrator
 * vouches for the address; open sign-up proves it with a link instead. An explicit `data.emailVerified` in the body
 * is kept. Every other way a user is created (sign-up, social sign-in) is left as Better Auth sets it.
 */
export const verifyAdminCreatedUser: UserCreateBefore = async (user, context) => {
  if (context?.path !== AuthEndpoint.ADMIN_CREATE_USER) return;
  if (requestedEmailVerified(context.body) !== undefined) return;
  return { data: { ...user, emailVerified: true } };
};
