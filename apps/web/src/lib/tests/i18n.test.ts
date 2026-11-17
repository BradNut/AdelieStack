import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { i18n } from '#lib/i18n.ts';

type Resolve = Parameters<typeof i18n>[0]['resolve'];

async function renderLang(headers: Record<string, string>) {
  const request = new Request('http://localhost/', { headers });
  const event = { request } as RequestEvent;
  const resolve: Resolve = async (_event, opts) => {
    const html = (await opts?.transformPageChunk?.({ html: '<html lang="en">', done: true })) ?? '';
    return new Response(html);
  };
  const response = await i18n({ event, resolve });
  return (await response.text()).match(/lang="([^"]+)"/)?.[1];
}

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
});
