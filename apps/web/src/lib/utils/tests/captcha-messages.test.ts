import { CAPTCHA_MISSING_RESPONSE, CAPTCHA_UNAVAILABLE, CAPTCHA_VERIFICATION_FAILED } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { locales } from '$lib/paraglide/runtime.js';
import { captchaErrorMessage } from '../captcha-messages';

describe('captchaErrorMessage', () => {
  it.each([CAPTCHA_MISSING_RESPONSE, CAPTCHA_VERIFICATION_FAILED])('maps %s to the invalid-captcha message', (code) => {
    expect(captchaErrorMessage({ code }, { locale: 'en' })).toBe('Invalid captcha, please try again.');
  });

  it('maps the provider outage to a distinct message', () => {
    const outage = captchaErrorMessage({ code: CAPTCHA_UNAVAILABLE }, { locale: 'en' });

    expect(outage).toMatch(/temporarily unavailable/i);
    expect(outage).not.toBe(captchaErrorMessage({ code: CAPTCHA_VERIFICATION_FAILED }, { locale: 'en' }));
  });

  it.each(locales)('has both messages in %s', (locale) => {
    for (const code of [CAPTCHA_VERIFICATION_FAILED, CAPTCHA_UNAVAILABLE]) {
      expect(captchaErrorMessage({ code }, { locale })).toBeTruthy();
    }
  });

  it('translates per locale', () => {
    const messages = (['en', 'de', 'es'] as const).map((locale) => captchaErrorMessage({ code: CAPTCHA_UNAVAILABLE }, { locale }));

    expect(new Set(messages).size).toBe(3);
  });

  it.each([null, undefined, {}, { code: 'INVALID_EMAIL_OR_PASSWORD' }])('returns null for %j', (error) => {
    expect(captchaErrorMessage(error)).toBeNull();
  });
});
