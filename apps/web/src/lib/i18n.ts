import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';

export const i18n: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
    event.request = localizedRequest;
    return resolve(event, {
      transformPageChunk: ({ html }) => {
        return html.replace('%lang%', locale);
      },
    });
  });
