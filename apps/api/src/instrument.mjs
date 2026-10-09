import 'dotenv/config';
import { getDevOnlySentryOptions, startOpenTelemetrySdk } from '@adelie/shared/otel';
import * as Sentry from '@sentry/node';

// Initialize OpenTelemetry SDK (no-op unless OTEL_ENABLED=true).
const sdk = startOpenTelemetrySdk({ serviceName: 'adelie-api' });
if (sdk) {
  console.log('OpenTelemetry SDK initialized for API');

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('OpenTelemetry SDK shut down successfully'))
      .catch((error) => console.error('Error shutting down OpenTelemetry SDK', error))
      .finally(() => process.exit(0));
  });
}

// Initialize Sentry. Spotlight and PII are dev-only.
Sentry.init({
  dsn: process.env.SENTRY_BACKEND_URL,
  environment: process.env.ENVIRONMENT || 'development',
  tracesSampleRate: 0,
  release: `adelie@${process.env.SITE_VERSION || '0.0.1'}`,
  ...getDevOnlySentryOptions(process.env.ENVIRONMENT),
});
