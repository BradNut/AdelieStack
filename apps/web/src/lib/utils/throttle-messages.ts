import { StatusCodes } from '@adelie/shared';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

type MessageOptions = { locale?: Locale };

/**
 * The translated "too many attempts" message for a throttled (429) Better Auth error, with the wait when the API
 * said how long. Null for any other error.
 */
export function throttledMessage(error: { status?: number; retryAfter?: unknown } | null | undefined, options: MessageOptions = {}): string | null {
  if (error?.status !== StatusCodes.TOO_MANY_REQUESTS) return null;
  const seconds = error.retryAfter;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return m.validation_throttled({}, options);
  const wait = new Intl.NumberFormat(options.locale ?? getLocale(), { style: 'unit', unit: 'second', unitDisplay: 'long' }).format(
    Math.ceil(seconds),
  );
  return m.validation_throttled_wait({ wait }, options);
}
