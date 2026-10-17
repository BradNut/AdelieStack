import { SocialAuthErrorCode } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { locales } from '#lib/paraglide/runtime.js';
import { socialErrorMessage } from '../social-auth';

describe('socialErrorMessage', () => {
  it('is null when the URL carries no error', () => {
    expect(socialErrorMessage(null)).toBeNull();
    expect(socialErrorMessage(undefined)).toBeNull();
    expect(socialErrorMessage('')).toBeNull();
  });

  it('explains the closed sign-up in English', () => {
    expect(socialErrorMessage(SocialAuthErrorCode.SIGNUP_DISABLED, { locale: 'en' })).toBe(
      'Registration is closed. Ask an administrator to create an account for you.',
    );
  });

  it('falls back to a generic message for an unknown code', () => {
    expect(socialErrorMessage('something_new', { locale: 'en' })).toBe('Sign-in with the provider failed. Please try again.');
  });

  it('does not treat object prototype keys as codes', () => {
    expect(socialErrorMessage('constructor', { locale: 'en' })).toBe(socialErrorMessage('something_new', { locale: 'en' }));
  });

  it.each(locales.flatMap((locale) => Object.values(SocialAuthErrorCode).map((code) => [locale, code] as const)))(
    'has distinct %s copy for %s',
    (locale, code) => {
      const message = socialErrorMessage(code, { locale });
      expect(message).toBeTruthy();
      expect(message).not.toBe(socialErrorMessage('something_new', { locale }));
    },
  );
});
