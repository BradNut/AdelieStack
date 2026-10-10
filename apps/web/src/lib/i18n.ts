import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';

/** The opening tag in app.html, written with a valid default so it passes the lang lint; swapped for the request's locale. */
const DEFAULT_HTML_LANG = '<html lang="en">';

export const i18n: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
    event.request = localizedRequest;
    return resolve(event, {
      transformPageChunk: ({ html }) => {
        return html.replace(DEFAULT_HTML_LANG, `<html lang="${locale}">`);
      },
    });
  });
