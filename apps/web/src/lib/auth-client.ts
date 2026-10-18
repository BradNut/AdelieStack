import { AUTH_BASE_PATH, LAST_LOGIN_METHOD_COOKIE } from '@adelie/shared';
import { passkeyClient } from '@better-auth/passkey/client';
import { adminClient, lastLoginMethodClient, twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/svelte';
import { withCaptchaBinding } from '#lib/client/captcha-binding.ts';
import { withRetryAfter } from '#lib/client/retry-after.ts';
import { goto } from '$app/navigation';

/** Where password sign-in sends a user whose account has two-factor enabled. */
export const TWO_FACTOR_PATH = '/login/two-factor';

/**
 * Browser-side Better Auth client. It talks to `AUTH_BASE_PATH` (`/api/auth/*`) on the web origin, which the
 * `/api/[...slug]` proxy forwards to the API, so the session cookie stays first-party. Its fetch refuses requests to
 * captcha-protected paths that skipped `createCaptchaForm().attempt`.
 */
export const authClient = createAuthClient({
  basePath: AUTH_BASE_PATH,
  fetchOptions: { customFetchImpl: withRetryAfter(withCaptchaBinding((input, init) => fetch(input, init))) },
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
