import { LAST_LOGIN_METHOD_COOKIE } from '@adelie/shared';
import { passkeyClient } from '@better-auth/passkey/client';
import { adminClient, lastLoginMethodClient, twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/svelte';
import { withRetryAfter } from '#lib/client/retry-after.ts';
import { goto } from '$app/navigation';

/** Where password sign-in sends a user whose account has two-factor enabled. */
export const TWO_FACTOR_PATH = '/login/two-factor';

/**
 * Browser-side Better Auth client. It talks to `/api/auth/*` on the web origin, which the
 * `/api/[...slug]` proxy forwards to the API, so the session cookie stays first-party.
 */
export const authClient = createAuthClient({
  fetchOptions: { customFetchImpl: withRetryAfter((input, init) => fetch(input, init)) },
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        goto(TWO_FACTOR_PATH);
      },
    }),
    passkeyClient(),
    adminClient(),
    lastLoginMethodClient({ cookieName: LAST_LOGIN_METHOD_COOKIE }),
  ],
});
