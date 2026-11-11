import { StatusCodes, withSecurityHeaders } from '@adelie/shared/constants';
import { getDevOnlySentryOptions } from '@adelie/shared/sentry';
import * as Sentry from '@sentry/sveltekit';
import { sentryHandle } from '@sentry/sveltekit';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { sequence } from '@sveltejs/kit/hooks';
import { createInitialModeExpression } from 'mode-watcher';
import { warnIfClientAddressUnconfigured } from '#lib/server/client-address-warning.ts';
import { loadSessionUser } from '#lib/server/session-user.ts';
import { honoClient, parseApiResponse } from '#lib/utils/api.ts';
import type { Api } from '#lib/utils/types.ts';
import { dev } from '$app/env';
import { PUBLIC_SENTRY_DSN } from '$app/env/public';
import { i18n } from './lib/i18n';

Sentry.init({
  dsn: PUBLIC_SENTRY_DSN,
  environment: dev ? 'development' : 'production',
  tracesSampleRate: dev ? 1 : 0,
  ...getDevOnlySentryOptions(dev ? 'development' : 'production'),
});

/** Marks where app.html expects the pre-paint theme script (it carries SvelteKit's CSP nonce). */
const MODE_WATCHER_PLACEHOLDER = '/* modewatcher.init */';
const themeInitScript = createInitialModeExpression();

/** Sub-requests are skipped: `apiClient` adds the forwarding header to them itself, so they say nothing about a proxy. */
const clientAddressWarning: Handle = ({ event, resolve }) => {
  if (!event.isSubRequest) warnIfClientAddressUnconfigured(event.request.headers);
  return resolve(event);
};

/**
 * Pages and the proxied API alike. `event.url` carries the scheme adapter-node resolved (`PROTOCOL_HEADER` or the pinned
 * origin behind a proxy), so HSTS follows the scheme the browser used. The CSP is SvelteKit's and is left untouched.
 */
const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  return withSecurityHeaders(response, { overHttps: event.url.protocol === 'https:' });
};

const apiClient: Handle = async ({ event, resolve }) => {
  /* ------------------------------ Register api ------------------------------ */
  const api: Api = honoClient({
    fetch: event.fetch,
    headers: {
      'x-forwarded-for': event.url.host.includes('sveltekit-prerender') ? '127.0.0.1' : event.getClientAddress(),
      host: event.request.headers.get('host') || '',
    },
  });

  /* ------------------------------ Set contexts ------------------------------ */
  event.locals.api = api;
  event.locals.parseApiResponse = parseApiResponse;
  // The proxied API (including Better Auth's own endpoints) does its own session handling.
  const isApiProxyRequest = event.url.pathname.startsWith('/api/');
  event.locals.user = isApiProxyRequest ? null : await loadSessionUser(api, event.request.headers.get('cookie'));

  /* ----------------------------- Return response ---------------------------- */
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => html.replace(MODE_WATCHER_PLACEHOLDER, () => themeInitScript),
  });
  return response;
};

export const handle: Handle = sequence(sentryHandle(), securityHeaders, clientAddressWarning, apiClient, i18n);

export const handleError: HandleServerError = ({ kind, error }) => {
  const errorId = crypto.randomUUID();
  const status = kind === 'unknown' ? StatusCodes.INTERNAL_SERVER_ERROR : error.status;
  if (status !== 404) {
    Sentry.captureException(error, { tags: { errorId } });
  }
  return { errorId };
};
