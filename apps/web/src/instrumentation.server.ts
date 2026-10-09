import { startOpenTelemetrySdk } from '@adelie/shared/otel';

// Starts the OpenTelemetry NodeSDK before application code loads.
// No-op unless OTEL_ENABLED=true (read from process.env by the shared helper).
const sdk = startOpenTelemetrySdk({ serviceName: 'adelie-web' });
if (sdk) {
  console.log('OpenTelemetry SDK initialized for web');

  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('OpenTelemetry SDK shut down successfully'))
      .catch((error) => console.error('Error shutting down OpenTelemetry SDK', error))
      .finally(() => process.exit(0));
  });
}
