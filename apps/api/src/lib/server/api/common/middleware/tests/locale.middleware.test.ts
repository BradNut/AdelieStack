import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { onError } from 'stoker/middlewares';
import { describe, expect, it } from 'vitest';
import { m } from '../../i18n';
import type { HonoEnv } from '../../utils/hono';
import { authState } from '../auth.middleware';
import { requestLocale } from '../locale.middleware';

function createApp() {
  return new Hono<HonoEnv>()
    .use(contextStorage())
    .use(requestLocale)
    .get('/locale', (c) => c.json({ locale: c.var.locale }))
    .get('/protected', authState('session'), (c) => c.json({ ok: true }))
    .onError(onError);
}

function get(path: string, acceptLanguage?: string) {
  const headers: Record<string, string> = acceptLanguage === undefined ? {} : { 'accept-language': acceptLanguage };
  return createApp().request(path, { headers });
}

describe('requestLocale middleware', () => {
  it('exposes the resolved locale and sets Content-Language', async () => {
    const res = await get('/locale', 'de-DE,de;q=0.9');
    expect(await res.json()).toEqual({ locale: 'de' });
    expect(res.headers.get('content-language')).toBe('de');
    expect(res.headers.get('vary')).toContain('Accept-Language');
  });

  it('falls back to en when Accept-Language is missing', async () => {
    const res = await get('/locale');
    expect(await res.json()).toEqual({ locale: 'en' });
    expect(res.headers.get('content-language')).toBe('en');
  });

  it('falls back to en for an unknown locale', async () => {
    const res = await get('/locale', 'fr-FR');
    expect(await res.json()).toEqual({ locale: 'en' });
  });
});

describe('localised auth error', () => {
  it.each([
    ['de', 'Sie müssen angemeldet sein, um auf diese Ressource zuzugreifen'],
    ['es', 'Debes iniciar sesión para acceder a este recurso'],
    ['en', 'You must be logged in to access this resource'],
  ])('serves the unauthenticated message in %s', async (locale, message) => {
    const res = await get('/protected', locale);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ message });
    expect(res.headers.get('content-language')).toBe(locale);
  });

  it('serves the base-locale message for an unknown locale', async () => {
    const res = await get('/protected', 'ja');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ message: m.auth_login_required({}, { locale: 'en' }) });
  });

  it('keeps concurrent requests isolated to their own locale', async () => {
    const [de, es] = await Promise.all([get('/protected', 'de'), get('/protected', 'es')]);
    expect(await de.json()).toMatchObject({ message: m.auth_login_required({}, { locale: 'de' }) });
    expect(await es.json()).toMatchObject({ message: m.auth_login_required({}, { locale: 'es' }) });
  });
});
