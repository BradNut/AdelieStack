// Import from the constants subpath: the package root pulls in zod schemas, which would run before z.config({ jitless: true }) below.
import { StatusCodes } from '@adelie/shared/constants';
import { getDevOnlySentryOptions } from '@adelie/shared/sentry';
import * as Sentry from '@sentry/sveltekit';
import type { HandleClientError } from '@sveltejs/kit/hooks';
import { z } from 'zod';
import { dev } from '$app/env';
import { PUBLIC_SENTRY_DSN } from '$app/env/public';

// The CSP forbids `unsafe-eval`; zod's JIT probe (`new Function`) would report a violation on every page.
z.config({ jitless: true });

Sentry.init({
  dsn: PUBLIC_SENTRY_DSN,
  environment: dev ? 'development' : 'production',
  tracesSampleRate: dev ? 1 : 0,
  ...getDevOnlySentryOptions(dev ? 'development' : 'production'),
});

export const handleError: HandleClientError = ({ kind, error }) => {
  const errorId = crypto.randomUUID();
  const status = kind === 'unknown' ? StatusCodes.INTERNAL_SERVER_ERROR : error.status;
  if (status !== 404) {
    Sentry.captureException(error, { tags: { errorId } });
  }
  return { errorId };
};
