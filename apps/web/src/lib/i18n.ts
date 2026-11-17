import type { AuthedUser } from '@adelie/shared';
import type { Handle } from '@sveltejs/kit/hooks';
import { cookieMaxAge, cookieName, cookieSameSite, isLocale, type Locale } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';

/** The opening tag in app.html, written with a valid default so it passes the lang lint; swapped for the request's locale. */
const DEFAULT_HTML_LANG = '<html lang="en">';

/**
 * The locale the site follows for a signed-in account holder: their Preferred Language while it is still supported.
 * None for a visitor, for an account without one, or while an admin impersonates (their own language is left alone).
 */
function preferredLocale(user: AuthedUser | null): Locale | undefined {
  if (!user || user.impersonating) return undefined;
  return isLocale(user.preferredLanguage) ? user.preferredLanguage : undefined;
}

export const i18n: Handle = ({ event, resolve }) => {
  const preferred = preferredLocale(event.locals.user);
  if (preferred && event.cookies.get(cookieName) !== preferred) {
    // Not httpOnly: the client runtime reads the locale from this cookie too.
    event.cookies.set(cookieName, preferred, {
      path: '/',
      maxAge: cookieMaxAge,
      httpOnly: false,
      sameSite: cookieSameSite ?? 'lax',
      secure: event.url.protocol === 'https:',
    });
  }
  // The cookie strategy comes first, so a stand-in request carrying only the preferred locale cookie makes this very
  // response render in it. The stand-in is only read for its locale: SvelteKit 3 made `event.request` read-only, and the
  // shared Request Locale strategy (cookie, preferredLanguage, baseLocale) never rewrites the request, so `resolve`
  // gets the original event (guarded by src/lib/tests/i18n-strategy.test.ts).
  const localeRequest = preferred ? new Request(event.request.url, { headers: { cookie: `${cookieName}=${preferred}` } }) : event.request;
  return paraglideMiddleware(localeRequest, ({ locale }) => {
    return resolve(event, {
      transformPageChunk: ({ html }) => {
        return html.replace(DEFAULT_HTML_LANG, `<html lang="${locale}">`);
      },
    });
  });
};
