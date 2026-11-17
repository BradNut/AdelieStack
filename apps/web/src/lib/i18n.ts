import { type AuthedUser, DEFAULT_COOKIE_ATTRIBUTES } from '@adelie/shared';
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { cookieMaxAge, cookieName, cookieSameSite, isLocale, type Locale } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';

/** The opening tag in app.html, written with a valid default so it passes the lang lint; swapped for the request's locale. */
const DEFAULT_HTML_LANG = '<html lang="en">';

/**
 * Set beside a locale cookie the hook synced from a Preferred Language, so that cookie can be told apart from one the
 * visitor chose: once the account has no Preferred Language ("Match my browser", perhaps saved on another device), a
 * marked cookie is cleared and the browser's language applies again; an unmarked one is the visitor's and is kept.
 */
export const LOCALE_FROM_PREFERENCE_COOKIE = 'locale_from_preference';
const LOCALE_FROM_PREFERENCE_VALUE = '1';

/** Both cookies live as long as Paraglide's own locale cookie and are sent on every path. */
const COOKIE_SCOPE = { path: '/', maxAge: cookieMaxAge } as const;

/** Paraglide's locale cookie, as its client runtime sets it. Not httpOnly: the client runtime reads the locale from it. */
const LOCALE_COOKIE_ATTRIBUTES = {
  ...COOKIE_SCOPE,
  httpOnly: false,
  sameSite: cookieSameSite ?? DEFAULT_COOKIE_ATTRIBUTES.sameSite,
} as const;

/** The marker is read by this hook only, so no script needs it. */
const MARKER_COOKIE_ATTRIBUTES = { ...COOKIE_SCOPE, ...DEFAULT_COOKIE_ATTRIBUTES } as const;

/**
 * The account holder the site follows the Preferred Language of: none for a visitor, or while an admin impersonates
 * (the admin's own language and cookies are left alone).
 */
function accountHolder(user: AuthedUser | null): AuthedUser | undefined {
  return user && !user.impersonating ? user : undefined;
}

/** The Preferred Language while it is still a supported locale; an unsupported one counts as none. */
function preferredLocale(user: AuthedUser): Locale | undefined {
  return isLocale(user.preferredLanguage) ? user.preferredLanguage : undefined;
}

/** Points the locale cookie, and its marker, at `locale` unless they already are. */
function syncLocaleCookie(cookies: Cookies, locale: Locale, secure: boolean) {
  if (cookies.get(cookieName) !== locale) cookies.set(cookieName, locale, { ...LOCALE_COOKIE_ATTRIBUTES, secure });
  if (cookies.get(LOCALE_FROM_PREFERENCE_COOKIE) !== LOCALE_FROM_PREFERENCE_VALUE) {
    cookies.set(LOCALE_FROM_PREFERENCE_COOKIE, LOCALE_FROM_PREFERENCE_VALUE, { ...MARKER_COOKIE_ATTRIBUTES, secure });
  }
}

/** Clears a locale cookie synced from a Preferred Language the account no longer has; reports whether it did. */
function clearSyncedLocaleCookie(cookies: Cookies): boolean {
  if (cookies.get(LOCALE_FROM_PREFERENCE_COOKIE) === undefined) return false;
  cookies.delete(cookieName, { path: COOKIE_SCOPE.path });
  cookies.delete(LOCALE_FROM_PREFERENCE_COOKIE, { path: COOKIE_SCOPE.path });
  return true;
}

/**
 * The request Paraglide reads this response's locale from. The cookie strategy comes first, so a stand-in carrying only
 * the preferred locale cookie renders in it, and one without the cookie (just cleared) follows `Accept-Language`. The
 * stand-in is only read for its locale: SvelteKit 3 made `event.request` read-only, and the shared Request Locale
 * strategy (cookie, preferredLanguage, baseLocale) never rewrites the request, so `resolve` gets the original event
 * (guarded by src/lib/tests/i18n-strategy.test.ts).
 */
function localeRequest(event: RequestEvent, preferred: Locale | undefined, cookieCleared: boolean): Request {
  if (preferred) return new Request(event.request.url, { headers: { cookie: `${cookieName}=${preferred}` } });
  if (!cookieCleared) return event.request;
  const acceptLanguage = event.request.headers.get('accept-language');
  return new Request(event.request.url, { headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {} });
}

export const i18n: Handle = ({ event, resolve }) => {
  const holder = accountHolder(event.locals.user);
  const preferred = holder && preferredLocale(holder);
  const secure = event.url.protocol === 'https:';
  if (preferred) syncLocaleCookie(event.cookies, preferred, secure);
  const cleared = !!holder && !preferred && clearSyncedLocaleCookie(event.cookies);
  const request = localeRequest(event, preferred, cleared);
  return paraglideMiddleware(request, ({ locale }) => {
    return resolve(event, {
      transformPageChunk: ({ html }) => {
        return html.replace(DEFAULT_HTML_LANG, `<html lang="${locale}">`);
      },
    });
  });
};
