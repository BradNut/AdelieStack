/**
 * Canonical set of valid API environment variables for config tests. Values are strings
 * (as they arrive from `process.env`); the zod DTO coerces numbers/booleans on parse.
 */
export const validEnvs: Record<string, string> = {
  DATABASE_USER: 'postgres',
  DATABASE_PASSWORD: 'postgres',
  DATABASE_HOST: 'localhost',
  DATABASE_PORT: '5432',
  DATABASE_DB: 'postgres',
  DB_MIGRATING: 'false',
  DB_SEEDING: 'false',
  LOG_LEVEL: 'info',
  ORIGIN: 'http://localhost:5173',
  DOMAIN: 'localhost',
  ENV: 'dev',
  ENVIRONMENT: 'development',
  NODE_ENV: 'development',
  PORT: '3001',
  REDIS_URL: 'redis://localhost:6379',
  SIGNING_SECRET: 'secret',
  BETTER_AUTH_SECRET: 'better-auth-secret-at-least-32-chars',
  BETTER_AUTH_URL: 'http://localhost:5173',
  PROJECT_NAME: 'adelie',
  STORAGE_HOST: 'localhost',
  STORAGE_PORT: '8333',
  STORAGE_ACCESS_KEY: 'user',
  STORAGE_SECRET_KEY: 'password',
  STORAGE_SSL: 'false',
  STORAGE_URL: 'http://localhost:8333',
  PUBLIC_IMAGE_URI: 'http://localhost:8333/adelie-public-development',
  TRUST_PROXY: 'false',
  DISABLE_RATE_LIMIT: 'false',
  OTEL_ENABLED: 'false',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318/v1/traces',
};

const envKeys = Object.keys(validEnvs);

/**
 * Replaces the canonical env keys on `process.env` with `envObj`. Keys with an `undefined`
 * value are deleted, so callers can simulate a missing variable.
 */
export function setProcessEnvs(envObj: Record<string, unknown>) {
  for (const key of envKeys) {
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(envObj)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }
}
