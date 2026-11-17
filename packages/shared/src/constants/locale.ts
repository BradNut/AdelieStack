/**
 * The order web and API use to work out the Request Locale, as Paraglide strategy names:
 * the locale cookie, then `Accept-Language`, then the base locale (`en`).
 * Both apps' Paraglide `strategy` (web `vite.config.ts` and both `paraglide:compile` scripts)
 * and the API locale middleware follow it; tests in each app fail if they drift.
 *
 * `preferredLanguage` here is Paraglide's name for its `Accept-Language` strategy, the browser's languages. It is not
 * the glossary's Preferred Language (the locale an account holder saves, stored as `users.locale`), which is no step in
 * this order: the web hook makes it win by syncing the locale cookie to it, and mail reads it before the Request Locale.
 */
export const REQUEST_LOCALE_ORDER = ['cookie', 'preferredLanguage', 'baseLocale'] as const;
