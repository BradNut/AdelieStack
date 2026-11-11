import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { AuthEndpoint } from './auth.endpoints';
import { isTwoFactorRedirect } from './auth.two-factor-redirect';

/**
 * The sign-in endpoints that end the Replaced Session. Not a generic "a new session was set" rule: admin
 * impersonation sets one too, and keeps the admin's session aside to restore it afterwards. Every other auth endpoint
 * is classified in auth.replaced-session.coverage.test.ts, which fails when a new one appears.
 */
export const ReplacedSessionPath = {
  EMAIL_SIGN_IN: AuthEndpoint.SIGN_IN_EMAIL,
  PASSKEY_SIGN_IN: AuthEndpoint.PASSKEY_VERIFY_AUTHENTICATION,
  /** Sets a session only when the client asks for one with the new passkey (`createSession`). */
  PASSKEY_REGISTRATION: AuthEndpoint.PASSKEY_VERIFY_REGISTRATION,
  /** Only the id-token sign-in sets a session here; the redirect sign-in sets it on the callback. */
  SOCIAL_SIGN_IN: AuthEndpoint.SIGN_IN_SOCIAL,
  /** Shared with linking from settings, which sets no new session and so keeps the current one. */
  SOCIAL_CALLBACK: AuthEndpoint.SOCIAL_CALLBACK,
} as const;

const replacedSessionPaths: readonly string[] = Object.values(ReplacedSessionPath);

/**
 * After-hook that ends the session the browser held before signing in again, whoever signs in. Better Auth's sign-in
 * never revokes it, and the two-factor plugin drops its cookie when it raises a challenge, so it would stay valid until
 * it expires. Holding the cookie is the same authority sign-out relies on, so the session is deleted by its token with no
 * owner check; a missing, badly signed or already-ended session is a no-op. Best-effort: an error is logged and the
 * sign-in response is left as it is.
 */
const endReplacedSession = createAuthMiddleware(async (ctx) => {
  try {
    const replacedToken = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
    if (!replacedToken) return;
    // The two-factor plugin clears `newSession` while a challenge is in flight, so the redirect is read from the response.
    const newToken = ctx.context.newSession?.session.token;
    const signedIn = newToken ? newToken !== replacedToken : isTwoFactorRedirect(ctx.context.returned);
    if (!signedIn) return;
    await ctx.context.internalAdapter.deleteSession(replacedToken);
  } catch (error) {
    ctx.context.logger.error('Could not end the Replaced Session', error);
  }
});

/** Must come after the two-factor plugin, so its after-hook sees the two-factor redirect. */
export const replacedSession = (): BetterAuthPlugin => ({
  id: 'replaced-session',
  hooks: { after: [{ matcher: (ctx) => replacedSessionPaths.includes(ctx.path ?? ''), handler: endReplacedSession }] },
});
