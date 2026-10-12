import { CaptchaProvider } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { CaptchaConfigError, captchaWidgetFor } from '../widgets';

describe('captchaWidgetFor', () => {
  it.each([CaptchaProvider.TURNSTILE, CaptchaProvider.HCAPTCHA])('selects the shipped widget for %s', (provider) => {
    expect(captchaWidgetFor(provider).provider).toBe(provider);
  });

  it.each([CaptchaProvider.RECAPTCHA, CaptchaProvider.CAPTCHAFOX])('fails loudly for %s, which has no shipped widget', (provider) => {
    expect(() => captchaWidgetFor(provider)).toThrowError(CaptchaConfigError);
    expect(() => captchaWidgetFor(provider)).toThrowError(new RegExp(provider));
  });

  it('fails loudly when captcha is on without a provider', () => {
    expect(() => captchaWidgetFor(undefined)).toThrowError(CaptchaConfigError);
  });
});
