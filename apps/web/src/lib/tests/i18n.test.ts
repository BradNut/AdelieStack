import type { AuthedUser } from '@adelie/shared';
import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '#lib/i18n.ts';
import { cookieMaxAge, cookieName } from '#lib/paraglide/runtime.js';

type Resolve = Parameters<typeof i18n>[0]['resolve'];

const SIGNED_IN: AuthedUser = {
  id: 'user-1',
  email: 'penguin@example.com',
  name: 'Penguin',
  roles: [],
  emailVerified: true,
  twoFactorEnabled: false,
  needsSecondFactor: false,
  preferredLanguage: null,
  impersonating: false,
};

async function render(
  headers: Record<string, string>,
  user: Partial<Pick<AuthedUser, 'preferredLanguage' | 'impersonating'>> | null = null,
  url = 'http://localhost/',
) {
  const request = new Request(url, { headers });
  const cookies = { get: (name: string) => headers.cookie?.match(new RegExp(`${name}=([^;]+)`))?.[1], set: vi.fn() };
  const locals = {
    user: user && { ...SIGNED_IN, preferredLanguage: user.preferredLanguage ?? null, impersonating: user.impersonating ?? false },
  };
  const event = { request, url: new URL(url), locals, cookies } as unknown as RequestEvent;
  const resolve: Resolve = async (_event, opts) => {
    const html = (await opts?.transformPageChunk?.({ html: '<html lang="en">', done: true })) ?? '';
    return new Response(html);
  };
  const response = await i18n({ event, resolve });
  return { lang: (await response.text()).match(/lang="([^"]+)"/)?.[1], setCookie: cookies.set };
}

const renderLang = async (headers: Record<string, string>) => (await render(headers)).lang;

describe('i18n handle', () => {
  it('renders in the Accept-Language locale when there is no locale cookie', async () => {
    expect(await renderLang({ 'accept-language': 'de-DE,de;q=0.9,en;q=0.5' })).toBe('de');
  });

  it('prefers the locale cookie over Accept-Language', async () => {
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

describe('i18n handle for a signed-in account holder', () => {
  it('renders in the Preferred Language and sets the locale cookie to it', async () => {
    const { lang, setCookie } = await render({ 'accept-language': 'de', cookie: 'PARAGLIDE_LOCALE=en' }, { preferredLanguage: 'es' });

    expect(lang).toBe('es');
    expect(setCookie).toHaveBeenCalledExactlyOnceWith(cookieName, 'es', {
      path: '/',
      maxAge: cookieMaxAge,
      httpOnly: false,
      sameSite: 'lax',
      secure: false,
    });
  });

  it('marks the cookie secure over https', async () => {
    const { setCookie } = await render({}, { preferredLanguage: 'de' }, 'https://example.com/');

    expect(setCookie).toHaveBeenCalledWith(cookieName, 'de', expect.objectContaining({ secure: true }));
  });

  it('leaves a cookie that already names the Preferred Language alone', async () => {
    const { lang, setCookie } = await render({ cookie: 'PARAGLIDE_LOCALE=de' }, { preferredLanguage: 'de' });

    expect(lang).toBe('de');
    expect(setCookie).not.toHaveBeenCalled();
  });

  it('follows the request when there is no Preferred Language', async () => {
    const { lang, setCookie } = await render({ 'accept-language': 'de' }, { preferredLanguage: null });

    expect(lang).toBe('de');
    expect(setCookie).not.toHaveBeenCalled();
  });

  it('treats an unsupported Preferred Language as none', async () => {
    const { lang, setCookie } = await render({ 'accept-language': 'de' }, { preferredLanguage: 'fr' });

    expect(lang).toBe('de');
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("leaves the admin's own language alone while impersonating", async () => {
    const { lang, setCookie } = await render(
      { 'accept-language': 'de', cookie: 'PARAGLIDE_LOCALE=en' },
      { preferredLanguage: 'es', impersonating: true },
    );

    expect(lang).toBe('en');
    expect(setCookie).not.toHaveBeenCalled();
  });
});
