import 'dotenv/config';
import { getDevOnlySentryOptions, startOpenTelemetrySdk } from '@adelie/shared/otel';
import * as Sentry from '@sentry/node';

// Initialize OpenTelemetry SDK (no-op unless OTEL_ENABLED=true).
const sdk = startOpenTelemetrySdk({ serviceName: 'adelie-api' });
if (sdk) {
  console.log('OpenTelemetry SDK initialized for API');
}

/** Flushes and stops the OpenTelemetry SDK. Signals are handled by the application's shutdown sequence, which calls this last. */
export async function flushTelemetry() {
  await sdk?.shutdown();
}

// Initialize Sentry. Spotlight and PII are dev-only.
Sentry.init({
  dsn: process.env.SENTRY_BACKEND_URL,
  environment: process.env.ENVIRONMENT || 'development',
  tracesSampleRate: 0,
  release: `adelie@${process.env.SITE_VERSION || '0.0.1'}`,
  ...getDevOnlySentryOptions(process.env.ENVIRONMENT),
});
