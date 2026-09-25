import { tryGetContext } from 'hono/context-storage';
import { baseLocale, extractLocaleFromHeader, type locales } from '../../../../paraglide/runtime.js';

/**
 * A locale from the API message catalogue (`apps/api/project.inlang`).
 * The locale list must match the web app's `apps/web/project.inlang`.
 */
export type Locale = (typeof locales)[number];

/**
 * Resolves the locale for an incoming request.
 *
 * Resolution order:
 * 1. `Accept-Language` header, honouring q-values; region tags fall back to
 *    their base language (`de-AT` -> `de`).
 * 2. The catalogue's base locale (`en`) when the header is missing, empty, or
 *    only names unsupported locales.
 */
export function resolveRequestLocale(request: Request): Locale {
  return extractLocaleFromHeader(request) ?? baseLocale;
}

/**
 * Returns the locale resolved for the current request by the locale
 * middleware, or the base locale outside a request (jobs, scripts, tests).
 */
export function getRequestLocale(): Locale {
  return tryGetContext<{ Variables: { locale?: Locale } }>()?.var.locale ?? baseLocale;
}
