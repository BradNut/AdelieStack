import { StatusCodes } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { locales } from '#lib/paraglide/runtime.js';
import { throttledMessage } from '../throttle-messages';

const throttled = { status: StatusCodes.TOO_MANY_REQUESTS };

describe('throttledMessage', () => {
  it('includes the wait time', () => {
    expect(throttledMessage({ ...throttled, retryAfter: 42 }, { locale: 'en' })).toBe('Too many attempts. Please try again in 42 seconds.');
  });

  it('rounds a fractional wait up', () => {
    expect(throttledMessage({ ...throttled, retryAfter: 1.2 }, { locale: 'en' })).toContain('2 seconds');
  });

  it.each([undefined, 0, -1, Number.NaN, '5'])('falls back to a message without a time for retryAfter %j', (retryAfter) => {
    expect(throttledMessage({ ...throttled, retryAfter }, { locale: 'en' })).toBe('Too many attempts. Please try again later.');
  });

  it.each(locales)('is translated in %s', (locale) => {
    expect(throttledMessage({ ...throttled, retryAfter: 30 }, { locale })).toContain('30');
    expect(throttledMessage(throttled, { locale })).toBeTruthy();
  });

  it('differs per locale', () => {
    const messages = locales.map((locale) => throttledMessage({ ...throttled, retryAfter: 30 }, { locale }));

    expect(new Set(messages).size).toBe(locales.length);
  });

  it.each([null, undefined, {}, { status: StatusCodes.UNAUTHORIZED, retryAfter: 5 }, { status: StatusCodes.INTERNAL_SERVER_ERROR }])(
    'returns null for %j',
    (error) => {
      expect(throttledMessage(error)).toBeNull();
    },
  );
});
