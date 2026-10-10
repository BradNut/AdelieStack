import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export { getDevOnlySentryOptions } from './sentry';

export const DEFAULT_OTLP_TRACES_ENDPOINT = 'http://localhost:4318/v1/traces' as const;
export const DEFAULT_SERVICE_VERSION = '0.0.1' as const;

export interface OtelOptions {
  serviceName: string;
  serviceVersion?: string;
  env?: Record<string, string | undefined>;
}

export function isOtelEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.OTEL_ENABLED === 'true';
}

export function createOtelResource(serviceName: string, serviceVersion: string = DEFAULT_SERVICE_VERSION) {
  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
  });
}

/** Starts the NodeSDK when `OTEL_ENABLED` is `true`; returns `undefined` when telemetry is off. */
export function startOpenTelemetrySdk({ serviceName, serviceVersion, env = process.env }: OtelOptions): NodeSDK | undefined {
  if (!isOtelEnabled(env)) return undefined;

  const sdk = new NodeSDK({
    resource: createOtelResource(serviceName, serviceVersion ?? env.SITE_VERSION),
    traceExporter: new OTLPTraceExporter({
      url: env.OTEL_EXPORTER_OTLP_ENDPOINT || DEFAULT_OTLP_TRACES_ENDPOINT,
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
  return sdk;
}
