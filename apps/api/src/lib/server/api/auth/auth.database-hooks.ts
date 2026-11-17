import type { BetterAuthOptions } from 'better-auth';

/** A Better Auth `databaseHooks.user.create.before` hook. */
export type UserCreateBefore = NonNullable<NonNullable<NonNullable<NonNullable<BetterAuthOptions['databaseHooks']>['user']>['create']>['before']>;
