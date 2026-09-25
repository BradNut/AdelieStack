import 'dotenv/config';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import * as Sentry from '@sentry/node';

// Initialize OpenTelemetry SDK
const otelEnabled = process.env.OTEL_ENABLED === 'true';
if (otelEnabled) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'adelie-api',
      [ATTR_SERVICE_VERSION]: process.env.SITE_VERSION || '0.0.1',
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable heavy instrumentations to prevent OOM
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
    ],
  });

  sdk.start();
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

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_BACKEND_URL,
  environment: process.env.ENVIRONMENT || 'development',
  tracesSampleRate: 0,
  sendDefaultPii: true,
  release: `adelie@${process.env.SITE_VERSION || '0.0.1'}`,
  spotlight: true,
});
