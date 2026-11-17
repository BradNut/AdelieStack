import { cookieDomain, cookieName, getLocale, type Locale, setLocale } from '#lib/paraglide/runtime.js';

/**
 * Makes the site follow a just-saved Preferred Language, as the server does on every later request: a locale sets the
 * locale cookie to it, and `null` ("Match my browser") clears the cookie so the browser's language applies again.
 * The server marks the cookies it syncs (`LOCALE_FROM_PREFERENCE_COOKIE` in `#lib/i18n.ts`, httpOnly, so not touched
 * here); on the next request it clears that marker, and on the account's other devices it clears their synced cookie.
 * Messages are not reactive to the locale, so the page reloads unless it already shows the chosen locale.
 * Not for an impersonated session, which leaves the admin's own cookie alone.
 */
export async function applyPreferredLanguage(locale: Locale | null, reload: () => void = () => window.location.reload()): Promise<void> {
  if (locale === null) {
    await cookieStore.delete({ name: cookieName, path: '/', domain: cookieDomain || null });
    reload();
    return;
  }
  const shown = getLocale();
  setLocale(locale, { reload: false });
  if (shown !== locale) reload();
}
