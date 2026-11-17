import type { AuthedUser } from '@adelie/shared';
import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { i18n, LOCALE_FROM_PREFERENCE_COOKIE } from '#lib/i18n.ts';
import { cookieMaxAge, cookieName } from '#lib/paraglide/runtime.js';
import { buildAuthedUser } from '#lib/tests/factories.ts';

type Resolve = Parameters<typeof i18n>[0]['resolve'];

async function render(
  headers: Record<string, string>,
  user: Partial<Pick<AuthedUser, 'preferredLanguage' | 'impersonating'>> | null = null,
  url = 'http://localhost/',
) {
  const request = new Request(url, { headers });
  const cookies = {
    get: (name: string) => headers.cookie?.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1],
    set: vi.fn(),
    delete: vi.fn(),
  };
  const locals = { user: user && buildAuthedUser(user) };
  const event = { request, url: new URL(url), locals, cookies } as unknown as RequestEvent;
  const resolve: Resolve = async (_event, opts) => {
    const html = (await opts?.transformPageChunk?.({ html: '<html lang="en">', done: true })) ?? '';
    return new Response(html);
  };
  const response = await i18n({ event, resolve });
  return { lang: (await response.text()).match(/lang="([^"]+)"/)?.[1], setCookie: cookies.set, deleteCookie: cookies.delete };
}

const renderLang = async (headers: Record<string, string>) => (await render(headers)).lang;

describe('i18n handle', () => {
  it('renders in the Accept-Language locale when there is no locale cookie', async () => {
    expect(await renderLang({ 'accept-language': 'de-DE,de;q=0.9,en;q=0.5' })).toBe('de');
  });

  it('takes the locale cookie before Accept-Language', async () => {
    expect(await renderLang({ 'accept-language': 'de', cookie: 'PARAGLIDE_LOCALE=es' })).toBe('es');
  });

  it('falls through an unsupported cookie to Accept-Language', async () => {
    expect(await renderLang({ 'accept-language': 'de', cookie: 'PARAGLIDE_LOCALE=fr' })).toBe('de');
  });

  it('falls back to en when neither names a supported locale', async () => {
    expect(await renderLang({ 'accept-language': 'ja' })).toBe('en');
  });

  it('falls back to en without a cookie or Accept-Language', async () => {
    expect(await renderLang({})).toBe('en');
  });

  it('sets no locale cookie for a visitor', async () => {
    expect((await render({ 'accept-language': 'de' })).setCookie).not.toHaveBeenCalled();
  });
});

/** The marker the hook sets beside a locale cookie it synced from a Preferred Language. */
const MARKER = `${LOCALE_FROM_PREFERENCE_COOKIE}=1`;
const MARKER_ATTRIBUTES = { path: '/', maxAge: cookieMaxAge, httpOnly: true, sameSite: 'lax', secure: false };

describe('i18n handle for a signed-in account holder', () => {
  it('renders in the Preferred Language and syncs the locale cookie to it, marked as from the preference', async () => {
    const { lang, setCookie } = await render({ 'accept-language': 'de', cookie: 'PARAGLIDE_LOCALE=en' }, { preferredLanguage: 'es' });

    expect(lang).toBe('es');
    expect(setCookie).toHaveBeenCalledTimes(2);
    expect(setCookie).toHaveBeenCalledWith(cookieName, 'es', {
      path: '/',
      maxAge: cookieMaxAge,
      httpOnly: false,
      sameSite: 'lax',
      secure: false,
    });
    expect(setCookie).toHaveBeenCalledWith(LOCALE_FROM_PREFERENCE_COOKIE, '1', MARKER_ATTRIBUTES);
  });

  it('marks both cookies secure over https', async () => {
    const { setCookie } = await render({}, { preferredLanguage: 'de' }, 'https://example.com/');

    expect(setCookie).toHaveBeenCalledWith(cookieName, 'de', expect.objectContaining({ secure: true }));
    expect(setCookie).toHaveBeenCalledWith(LOCALE_FROM_PREFERENCE_COOKIE, '1', expect.objectContaining({ secure: true }));
  });

  it('leaves a marked cookie that already names the Preferred Language alone', async () => {
    const { lang, setCookie } = await render({ cookie: `PARAGLIDE_LOCALE=de; ${MARKER}` }, { preferredLanguage: 'de' });

    expect(lang).toBe('de');
    expect(setCookie).not.toHaveBeenCalled();
  });

  it('only adds the marker when the locale cookie already names the Preferred Language', async () => {
    // As after saving on this device: the browser set the locale cookie itself, which carries no marker.
    const { setCookie } = await render({ cookie: 'PARAGLIDE_LOCALE=de' }, { preferredLanguage: 'de' });

    expect(setCookie).toHaveBeenCalledExactlyOnceWith(LOCALE_FROM_PREFERENCE_COOKIE, '1', MARKER_ATTRIBUTES);
  });

  it('follows the request when there is no Preferred Language', async () => {
    const { lang, setCookie, deleteCookie } = await render({ 'accept-language': 'de' }, { preferredLanguage: null });

    expect(lang).toBe('de');
    expect(setCookie).not.toHaveBeenCalled();
    expect(deleteCookie).not.toHaveBeenCalled();
  });

  it('treats an unsupported Preferred Language as none', async () => {
    const { lang, setCookie } = await render({ 'accept-language': 'de' }, { preferredLanguage: 'fr' });

    expect(lang).toBe('de');
    expect(setCookie).not.toHaveBeenCalled();
  });

  it.each([null, 'fr'])(
    'clears a locale cookie synced from a Preferred Language that is now %s, so the browser language applies again',
    async (preferredLanguage) => {
      const { lang, setCookie, deleteCookie } = await render(
        { 'accept-language': 'de', cookie: `PARAGLIDE_LOCALE=es; ${MARKER}` },
        { preferredLanguage },
      );

      expect(lang).toBe('de');
      expect(setCookie).not.toHaveBeenCalled();
      expect(deleteCookie).toHaveBeenCalledTimes(2);
      expect(deleteCookie).toHaveBeenCalledWith(cookieName, { path: '/' });
      expect(deleteCookie).toHaveBeenCalledWith(LOCALE_FROM_PREFERENCE_COOKIE, { path: '/' });
    },
  );

  it('keeps a locale cookie the visitor chose themselves when there is no Preferred Language', async () => {
    const { lang, deleteCookie } = await render({ 'accept-language': 'de', cookie: 'PARAGLIDE_LOCALE=es' }, { preferredLanguage: null });

    expect(lang).toBe('es');
    expect(deleteCookie).not.toHaveBeenCalled();
  });

  it("leaves the admin's own language alone while impersonating", async () => {
    const { lang, setCookie, deleteCookie } = await render(
      { 'accept-language': 'de', cookie: 'PARAGLIDE_LOCALE=en' },
      { preferredLanguage: 'es', impersonating: true },
    );

    expect(lang).toBe('en');
    expect(setCookie).not.toHaveBeenCalled();
    expect(deleteCookie).not.toHaveBeenCalled();
  });

  it("keeps the admin's marked cookie while impersonating an account without a Preferred Language", async () => {
    const { lang, deleteCookie } = await render(
      { 'accept-language': 'de', cookie: `PARAGLIDE_LOCALE=es; ${MARKER}` },
      { preferredLanguage: null, impersonating: true },
    );

    expect(lang).toBe('es');
    expect(deleteCookie).not.toHaveBeenCalled();
  });
});

describe('i18n handle for a visitor', () => {
  it('keeps a marked locale cookie after sign-out', async () => {
    const { lang, deleteCookie } = await render({ 'accept-language': 'de', cookie: `PARAGLIDE_LOCALE=es; ${MARKER}` });

    expect(lang).toBe('es');
    expect(deleteCookie).not.toHaveBeenCalled();
  });
});
