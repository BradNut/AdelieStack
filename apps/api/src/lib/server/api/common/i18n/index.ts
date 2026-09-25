import { overwriteGetLocale } from '../../../../paraglide/runtime.js';
import { getRequestLocale } from './locale';

// Message functions read the locale the locale middleware stored on the
// current Hono context (via `contextStorage()`), so services and helpers can
// call `m.*()` without threading the request through.
overwriteGetLocale(getRequestLocale);

export { m } from '../../../../paraglide/messages.js';
export { baseLocale, locales } from '../../../../paraglide/runtime.js';
export { getRequestLocale, type Locale, resolveRequestLocale } from './locale';
