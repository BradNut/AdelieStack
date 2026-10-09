import { isOtelEnabled } from '@adelie/shared/otel';
import { httpInstrumentationMiddleware } from '@hono/otel';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

/**
 * Applies `@hono/otel` HTTP instrumentation when `OTEL_ENABLED` is set.
 * When telemetry is off this is a passthrough so spans are never created.
 */
export function otelInstrumentation(): MiddlewareHandler {
  if (!isOtelEnabled()) {
    return createMiddleware((_c, next) => next());
  }
  return httpInstrumentationMiddleware({
    serviceName: 'adelie-api',
    serviceVersion: process.env.SITE_VERSION || '0.0.1',
  });
}
