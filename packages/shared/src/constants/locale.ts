/**
 * The order web and API use to work out the Request Locale, as Paraglide strategy names:
 * the locale cookie, then `Accept-Language`, then the base locale (`en`).
 * Both apps' Paraglide `strategy` (web `vite.config.ts` and both `paraglide:compile` scripts)
 * and the API locale middleware follow it; tests in each app fail if they drift.
 */
export const REQUEST_LOCALE_ORDER = ['cookie', 'preferredLanguage', 'baseLocale'] as const;
