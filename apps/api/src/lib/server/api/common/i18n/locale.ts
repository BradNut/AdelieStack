import { REQUEST_LOCALE_ORDER } from '@adelie/shared/constants';
import { tryGetContext } from 'hono/context-storage';
import { baseLocale, extractLocaleFromRequestWithStrategies, type locales } from '../../../../paraglide/runtime.js';

/**
 * A locale from the API message catalogue (`apps/api/project.inlang`).
 * The locale list must match the web app's `apps/web/project.inlang`.
 */
export type Locale = (typeof locales)[number];

/**
 * Resolves the locale for an incoming request.
 *
 * Follows the shared `REQUEST_LOCALE_ORDER`, the same order the web app uses:
 * 1. The Paraglide locale cookie (`PARAGLIDE_LOCALE`), which the web proxy
 *    forwards; an unsupported value is skipped.
 * 2. `Accept-Language` header, honouring q-values; region tags fall back to
 *    their base language (`de-AT` -> `de`).
 * 3. The catalogue's base locale (`en`) when neither names a supported locale.
 */
export function resolveRequestLocale(request: Request): Locale {
  return extractLocaleFromRequestWithStrategies(request, [...REQUEST_LOCALE_ORDER]);
}

/**
 * Returns the locale resolved for the current request by the locale
 * middleware, or the base locale outside a request (jobs, scripts, tests).
 */
export function getRequestLocale(): Locale {
  return tryGetContext<{ Variables: { locale?: Locale } }>()?.var.locale ?? baseLocale;
}
