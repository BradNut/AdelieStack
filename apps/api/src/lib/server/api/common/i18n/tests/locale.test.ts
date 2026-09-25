import { describe, expect, it } from 'vitest';
import { baseLocale, getRequestLocale, locales, m, resolveRequestLocale } from '../index';

function requestWith(acceptLanguage?: string) {
  const headers = new Headers();
  if (acceptLanguage !== undefined) headers.set('accept-language', acceptLanguage);
  return new Request('http://localhost/api', { headers });
}

describe('resolveRequestLocale', () => {
  it('uses en as the base locale', () => {
    expect(baseLocale).toBe('en');
  });

  it.each(locales)('resolves the supported locale %s from Accept-Language', (locale) => {
    expect(resolveRequestLocale(requestWith(locale))).toBe(locale);
  });

  it('maps a region tag to its base language', () => {
    expect(resolveRequestLocale(requestWith('es-MX'))).toBe('es');
  });

  it('picks the highest q-value supported locale', () => {
    expect(resolveRequestLocale(requestWith('fr;q=1, es;q=0.4, de;q=0.8'))).toBe('de');
  });

  it('falls back to the base locale when the header is missing', () => {
    expect(resolveRequestLocale(requestWith())).toBe(baseLocale);
  });

  it('falls back to the base locale when the header is empty', () => {
    expect(resolveRequestLocale(requestWith(''))).toBe(baseLocale);
  });

  it.each(['fr', 'fr-FR, ja;q=0.9', '*', 'not a locale'])('falls back to the base locale for unsupported value %j', (header) => {
    expect(resolveRequestLocale(requestWith(header))).toBe(baseLocale);
  });
});

describe('getRequestLocale', () => {
  it('returns the base locale outside a request context', () => {
    expect(getRequestLocale()).toBe(baseLocale);
  });

  it('makes message functions default to the base locale outside a request', () => {
    expect(m.auth_login_required()).toBe(m.auth_login_required({}, { locale: 'en' }));
  });
});
