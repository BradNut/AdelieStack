import { AUTH_BASE_PATH, LAST_LOGIN_METHOD_COOKIE } from '@adelie/shared';
import { passkeyClient } from '@better-auth/passkey/client';
import { adminClient, lastLoginMethodClient, twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/svelte';
import { withCaptchaBinding } from '#lib/client/captcha-binding.ts';
import { withRetryAfter } from '#lib/client/retry-after.ts';

/**
 * Browser-side Better Auth client. It talks to `AUTH_BASE_PATH` (`/api/auth/*`) on the web origin, which the
 * `/api/[...slug]` proxy forwards to the API, so the session cookie stays first-party. Its fetch refuses requests to
 * captcha-protected paths that skipped `createCaptchaForm().attempt`.
 */
export const authClient = createAuthClient({
  basePath: AUTH_BASE_PATH,
  fetchOptions: { customFetchImpl: withRetryAfter(withCaptchaBinding((input, init) => fetch(input, init))) },
  plugins: [
    // No `onTwoFactorRedirect`: each password sign-in caller handles `twoFactorRedirect` itself, so a challenge
    // raised from the re-authentication dialog does not navigate away (ADR 0008).
    twoFactorClient(),
    passkeyClient(),
    adminClient(),
    lastLoginMethodClient({ cookieName: LAST_LOGIN_METHOD_COOKIE }),
  ],
});
