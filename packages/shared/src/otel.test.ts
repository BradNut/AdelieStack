import { describe, expect, it } from 'vitest';
import { Environment } from './constants/environment';
import { createOtelResource, getDevOnlySentryOptions, isOtelEnabled, startOpenTelemetrySdk } from './otel';

describe('createOtelResource', () => {
  it('sets service name and version as semantic-convention attributes', () => {
    const { attributes } = createOtelResource('adelie-api', '1.2.3');
    expect(attributes['service.name']).toBe('adelie-api');
    expect(attributes['service.version']).toBe('1.2.3');
  });

  it('falls back to the default version', () => {
    expect(createOtelResource('adelie-web').attributes['service.version']).toBe('0.0.1');
  });
});

describe('getDevOnlySentryOptions', () => {
  it('enables spotlight and PII in development', () => {
    expect(getDevOnlySentryOptions(Environment.DEVELOPMENT)).toEqual({ spotlight: true, sendDefaultPii: true });
  });

  it.each([
    ['staging', Environment.STAGING],
    ['production', Environment.PRODUCTION],
    ['unset', undefined],
    ['empty', ''],
    ['an unknown value', 'dev'],
  ])('fails closed, disabling spotlight and PII, when %s', (_name, environment) => {
    expect(getDevOnlySentryOptions(environment)).toEqual({ spotlight: false, sendDefaultPii: false });
  });
});

describe('OTEL_ENABLED gating', () => {
  it.each([{}, { OTEL_ENABLED: 'false' }, { OTEL_ENABLED: '' }])('is off for %j', (env) => {
    expect(isOtelEnabled(env)).toBe(false);
    expect(startOpenTelemetrySdk({ serviceName: 'adelie-api', env })).toBeUndefined();
  });

  it('is on when OTEL_ENABLED is true', () => {
    expect(isOtelEnabled({ OTEL_ENABLED: 'true' })).toBe(true);
  });
});
