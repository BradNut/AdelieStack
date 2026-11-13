import { CREDENTIAL_PROVIDER_ID } from '@adelie/shared';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import { isRecord } from '#lib/server/api/common/utils/is-record';
import { AuthEndpoint } from './auth.endpoints';
import type { PasswordHasher } from './auth.password-hash';

/**
 * After a password sign-in that got past the password check (a session or a two-factor challenge), replaces a stored
 * hash made at an older cost with one from `hasher`. A hash can only be upgraded while the password is at hand, so this
 * is where it happens. Best-effort: a failure is logged and the sign-in stands.
 */
export const passwordRehash = (hasher: PasswordHasher): BetterAuthPlugin => ({
  id: 'password-rehash',
  hooks: {
    after: [
      {
        matcher: (ctx) => ctx.path === AuthEndpoint.SIGN_IN_EMAIL,
        handler: createAuthMiddleware(async (ctx) => {
          if (isAPIError(ctx.context.returned)) return;
          const { email, password } = isRecord(ctx.body) ? ctx.body : {};
          if (typeof email !== 'string' || typeof password !== 'string') return;
          try {
            const found = await ctx.context.internalAdapter.findUserByEmail(email.toLowerCase(), { includeAccounts: true });
            const account = found?.accounts.find((row) => row.providerId === CREDENTIAL_PROVIDER_ID && row.accountId === found.user.id);
            if (!found || !account?.password || !hasher.needsRehash(account.password)) return;
            // The response says the password was right; checking again costs one hash at the old cost, once per account.
            if (!(await hasher.verify({ hash: account.password, password }))) return;
            await ctx.context.internalAdapter.updatePassword(found.user.id, await hasher.hash(password));
          } catch (error) {
            ctx.context.logger.error('Could not upgrade the password hash', error);
          }
        }),
      },
    ],
  },
});
