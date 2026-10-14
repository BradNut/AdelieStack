import type { Handle } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '$lib/paraglide/server';

/** The opening tag in app.html, written with a valid default so it passes the lang lint; swapped for the request's locale. */
const DEFAULT_HTML_LANG = '<html lang="en">';

export const i18n: Handle = ({ event, resolve }) =>
  // SvelteKit 3 made `event.request` read-only. The cookie/baseLocale strategy never rewrites the request, so the original is passed through (guarded by src/lib/tests/i18n-strategy.test.ts).
  paraglideMiddleware(event.request, ({ locale }) => {
    return resolve(event, {
      transformPageChunk: ({ html }) => {
        return html.replace(DEFAULT_HTML_LANG, `<html lang="${locale}">`);
      },
    });
  });
