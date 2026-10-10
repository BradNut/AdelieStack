import { getDevOnlySentryOptions } from '@adelie/shared/sentry';
import * as Sentry from '@sentry/sveltekit';
import type { HandleClientError } from '@sveltejs/kit';
import { z } from 'zod';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';

// The CSP forbids `unsafe-eval`; zod's JIT probe (`new Function`) would report a violation on every page.
z.config({ jitless: true });

Sentry.init({
  dsn: env.PUBLIC_SENTRY_DSN || undefined,
  environment: dev ? 'development' : 'production',
  tracesSampleRate: dev ? 1 : 0,
  ...getDevOnlySentryOptions(dev ? 'development' : 'production'),
});

export const handleError: HandleClientError = ({ error, status, message }) => {
  const errorId = crypto.randomUUID();
  if (status !== 404) {
    Sentry.captureException(error, { tags: { errorId } });
  }
  return { message, errorId };
};
