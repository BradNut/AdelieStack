import { describe, expect, it } from 'vitest';
import { envsDto } from '../env.dto';

const validEnv = {
  DATABASE_USER: 'postgres',
  DATABASE_PASSWORD: 'postgres',
  DATABASE_HOST: 'localhost',
  DATABASE_PORT: '5432',
  DATABASE_DB: 'postgres',
  LOG_LEVEL: 'debug',
  ORIGIN: 'http://localhost:5173',
  DOMAIN: 'localhost',
  REDIS_URL: 'redis://localhost:6379',
  SIGNING_SECRET: 'secret',
  BETTER_AUTH_SECRET: 'better-auth-secret-at-least-32-chars',
  BETTER_AUTH_URL: 'http://localhost:5173',
  ENV: 'dev',
  PORT: '3001',
  STORAGE_HOST: 'localhost',
  STORAGE_PORT: '8333',
  STORAGE_ACCESS_KEY: 'user',
  STORAGE_SECRET_KEY: 'password',
  STORAGE_URL: 'http://localhost:8333',
  PUBLIC_IMAGE_URI: 'http://localhost:8333/adelie-public-development',
} as const;

describe('envsDto observability vars', () => {
  it('defaults OTel off and keeps Sentry optional', () => {
    const env = envsDto.parse({ ...validEnv });
    expect(env.OTEL_ENABLED).toBe(false);
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://localhost:4318/v1/traces');
    expect(env.SENTRY_BACKEND_URL).toBeUndefined();
  });

  it('coerces OTEL_ENABLED and accepts the Sentry/OTLP urls', () => {
    const env = envsDto.parse({
      ...validEnv,
      OTEL_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://jaeger:4318/v1/traces',
      SENTRY_BACKEND_URL: 'https://sentry.example.com/1',
    });
    expect(env.OTEL_ENABLED).toBe(true);
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://jaeger:4318/v1/traces');
    expect(env.SENTRY_BACKEND_URL).toBe('https://sentry.example.com/1');
  });

  it('allows an empty Sentry url', () => {
    expect(envsDto.parse({ ...validEnv, SENTRY_BACKEND_URL: '' }).SENTRY_BACKEND_URL).toBe('');
  });

  it('rejects a non-url OTLP endpoint', () => {
    expect(() => envsDto.parse({ ...validEnv, OTEL_EXPORTER_OTLP_ENDPOINT: 'not-a-url' })).toThrow();
  });

  it('rejects a non-url Sentry endpoint', () => {
    expect(() => envsDto.parse({ ...validEnv, SENTRY_BACKEND_URL: 'not-a-url' })).toThrow();
  });
});

describe('envsDto security switches', () => {
  it('defaults the rate-limit switches off', () => {
    const env = envsDto.parse({ ...validEnv });
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.DISABLE_RATE_LIMIT).toBe(false);
  });

  it('coerces the rate-limit switches from strings', () => {
    const env = envsDto.parse({ ...validEnv, TRUST_PROXY: 'true', DISABLE_RATE_LIMIT: 'true' });
    expect(env.TRUST_PROXY).toBe(true);
    expect(env.DISABLE_RATE_LIMIT).toBe(true);
  });
});

describe('envsDto required variables', () => {
  it.each(['DATABASE_USER', 'REDIS_URL', 'SIGNING_SECRET', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'DOMAIN', 'STORAGE_URL', 'PUBLIC_IMAGE_URI'])(
    'rejects env missing %s',
    (key) => {
      const { [key]: _omitted, ...rest } = validEnv as Record<string, unknown>;
      expect(() => envsDto.parse(rest)).toThrow();
    },
  );

  it('rejects an empty SIGNING_SECRET', () => {
    expect(() => envsDto.parse({ ...validEnv, SIGNING_SECRET: '' })).toThrow();
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => envsDto.parse({ ...validEnv, PORT: 'not-a-number' })).toThrow();
  });
});

describe('envsDto Better Auth variables', () => {
  it('accepts a 32+ character secret and a url', () => {
    const env = envsDto.parse({ ...validEnv });
    expect(env.BETTER_AUTH_SECRET).toBe(validEnv.BETTER_AUTH_SECRET);
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:5173');
  });

  it('rejects a BETTER_AUTH_SECRET shorter than 32 characters', () => {
    expect(() => envsDto.parse({ ...validEnv, BETTER_AUTH_SECRET: 'x'.repeat(31) })).toThrow();
  });

  it('rejects an empty BETTER_AUTH_SECRET', () => {
    expect(() => envsDto.parse({ ...validEnv, BETTER_AUTH_SECRET: '' })).toThrow();
  });

  it('rejects a non-url BETTER_AUTH_URL', () => {
    expect(() => envsDto.parse({ ...validEnv, BETTER_AUTH_URL: 'not-a-url' })).toThrow();
  });
});

describe('envsDto two-factor issuer', () => {
  it('defaults TWO_FACTOR_ISSUER to AdelieStack', () => {
    expect(envsDto.parse({ ...validEnv }).TWO_FACTOR_ISSUER).toBe('AdelieStack');
  });

  it('accepts a custom issuer', () => {
    expect(envsDto.parse({ ...validEnv, TWO_FACTOR_ISSUER: 'Acme' }).TWO_FACTOR_ISSUER).toBe('Acme');
  });

  it('rejects an empty issuer', () => {
    expect(() => envsDto.parse({ ...validEnv, TWO_FACTOR_ISSUER: '' })).toThrow();
  });
});

describe('envsDto seed admin', () => {
  it('keeps ADMIN_EMAIL optional', () => {
    expect(envsDto.parse({ ...validEnv }).ADMIN_EMAIL).toBeUndefined();
  });

  it('accepts a valid ADMIN_EMAIL', () => {
    expect(envsDto.parse({ ...validEnv, ADMIN_EMAIL: 'admin@example.com' }).ADMIN_EMAIL).toBe('admin@example.com');
  });

  it('rejects an ADMIN_EMAIL that is not an email', () => {
    expect(() => envsDto.parse({ ...validEnv, ADMIN_EMAIL: 'admin' })).toThrow();
  });
});
