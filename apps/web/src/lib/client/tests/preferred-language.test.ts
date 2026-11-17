// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cookieName, getLocale, setLocale } from '#lib/paraglide/runtime.js';
import { applyPreferredLanguage } from '../preferred-language.ts';

const localeCookie = () => document.cookie.match(new RegExp(`${cookieName}=([^;]*)`))?.[1];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('applyPreferredLanguage', () => {
  it('sets the locale cookie to a new Preferred Language and reloads so the page renders in it', async () => {
    setLocale('en', { reload: false });
    const reload = vi.fn();

    await applyPreferredLanguage('de', reload);

    expect(localeCookie()).toBe('de');
    expect(getLocale()).toBe('de');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not reload when the page already shows the Preferred Language', async () => {
    setLocale('es', { reload: false });
    const reload = vi.fn();

    await applyPreferredLanguage('es', reload);

    expect(localeCookie()).toBe('es');
    expect(reload).not.toHaveBeenCalled();
  });

  it('clears the locale cookie for "Match my browser" before reloading, so the browser language applies', async () => {
    // jsdom has no Cookie Store API; this stand-in records the order of the browser calls.
    const calls: string[] = [];
    vi.stubGlobal('cookieStore', { delete: vi.fn(async (options) => calls.push(`delete ${JSON.stringify(options)}`)) });
    const reload = vi.fn(() => calls.push('reload'));

    await applyPreferredLanguage(null, reload);

    expect(calls).toEqual([`delete ${JSON.stringify({ name: cookieName, path: '/', domain: null })}`, 'reload']);
  });
});
