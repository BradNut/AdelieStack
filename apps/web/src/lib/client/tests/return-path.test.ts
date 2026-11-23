import { describe, expect, it } from 'vitest';
import { currentReturnPath, returnPathFrom, withReturnPath } from '../return-path';

const returnTo = (value: string) => returnPathFrom(new URLSearchParams({ returnTo: value }));

describe('returnPathFrom', () => {
  it.each([
    ['a page', '/settings/security'],
    ['a page with a query string', '/settings/connected-accounts?tab=1'],
    ['a page with a fragment', '/settings/security#passkeys'],
    ['home', '/'],
  ])('accepts %s', (_name, value) => {
    expect(returnTo(value)).toBe(value);
  });

  it('falls back to home without a return path', () => {
    expect(returnPathFrom(new URLSearchParams())).toBe('/');
  });

  it.each([
    ['a tab', '/\t/evil.example'],
    ['a newline', '/\n/evil.example'],
    ['a carriage return', '/\r/evil.example'],
    ['a NUL', '/settings\u0000'],
    ['a DEL', '/settings\u007f'],
    ['a C1 control', '/settings\u0085'],
    ['a percent-encoded tab', '/%09/evil.example'],
    ['a percent-encoded newline', '/settings%0A'],
    ['a lowercase percent-encoded carriage return', '/settings%0d'],
    ['a percent-encoded NUL', '/settings%00'],
  ])('falls back to home for a return path with %s', (_name, value) => {
    expect(returnTo(value)).toBe('/');
  });

  it.each([
    ['protocol-relative', '//evil.example'],
    ['backslash', '/\\evil.example'],
    ['leading backslash', '\\\\evil.example'],
    ['percent-encoded protocol-relative', '/%2F/evil.example'],
    ['percent-encoded backslash', '/%5Cevil.example'],
    ['absolute', 'https://evil.example'],
    ['script', 'javascript:alert(1)'],
    ['relative', 'settings'],
    ['malformed encoding', '/settings%E0%A4%A'],
    ['empty', ''],
  ])('falls back to home for a %s return path', (_name, value) => {
    expect(returnTo(value)).toBe('/');
  });
});

describe('withReturnPath', () => {
  it('carries a page with a query string', () => {
    expect(withReturnPath('/login', '/settings/connected-accounts?tab=1')).toBe('/login?returnTo=%2Fsettings%2Fconnected-accounts%3Ftab%3D1');
  });

  it.each(['/\t/evil.example', '/%0A/evil.example', '//evil.example', '/\\evil.example'])('drops the unsafe return path %j', (value) => {
    expect(withReturnPath('/login', value)).toBe('/login');
  });
});

describe('currentReturnPath', () => {
  it('keeps the query string of the current page without the provider error', () => {
    expect(currentReturnPath({ pathname: '/settings/connected-accounts', search: '?tab=1&error=access_denied' })).toBe(
      '/settings/connected-accounts?tab=1',
    );
  });

  it('falls back to home for a current path that resolves off the app', () => {
    expect(currentReturnPath({ pathname: '//evil.example', search: '' })).toBe('/');
  });
});
