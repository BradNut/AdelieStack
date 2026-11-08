import { AppRoute } from '@adelie/shared';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { AuthEndpoint } from './auth.endpoints';
import { isTwoFactorRedirect } from './auth.replaced-session';

/** Where a social sign-in creates a session. The redirect branch of the sign-in endpoint creates none, so the plugin does nothing there. */
const socialSignInPaths: readonly string[] = [AuthEndpoint.SIGN_IN_SOCIAL, AuthEndpoint.SOCIAL_CALLBACK];

/**
 * Makes the two-factor plugin's own after-hook also run on social sign-in (ADR 0012). Its handler stays the only code
 * that replaces the new session with a challenge (ADR 0009). This depends on the shape of the plugin's `hooks.after`,
 * so an upgrade that changes it shows up in auth.social-two-factor.test.ts.
 */
export function challengeSocialSignIn<Plugin extends BetterAuthPlugin>(plugin: Plugin): Plugin {
  return {
    ...plugin,
    hooks: {
      ...plugin.hooks,
      after: plugin.hooks?.after?.map((hook) => ({
        ...hook,
        matcher: (ctx: Parameters<typeof hook.matcher>[0]) => hook.matcher(ctx) || socialSignInPaths.includes(ctx.path ?? ''),
      })),
    },
  };
}

/**
 * The provider callback is a browser navigation, so the plugin's JSON answer becomes a redirect to the Two-factor
 * Challenge page. It carries no return path: social sign-in always ends on the home page, the page's fallback. Linking
 * from settings shares the callback but creates no session, so no challenge is raised and the hook does nothing.
 */
const redirectToChallenge = createAuthMiddleware(async (ctx) => {
  if (!isTwoFactorRedirect(ctx.context.returned)) return;
  throw ctx.redirect(AppRoute.LOGIN_TWO_FACTOR);
});

/** Must come after replacedSession, which reads the plugin's JSON answer to know a challenge was raised. */
export const socialTwoFactorRedirect = (): BetterAuthPlugin => ({
  id: 'social-two-factor-redirect',
  hooks: { after: [{ matcher: (ctx) => ctx.path === AuthEndpoint.SOCIAL_CALLBACK, handler: redirectToChallenge }] },
});
