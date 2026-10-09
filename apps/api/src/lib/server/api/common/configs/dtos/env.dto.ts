import { z } from 'zod/v4';

export const envsDto = z.object({
  DATABASE_USER: z.string(),
  DATABASE_PASSWORD: z.string(),
  DATABASE_HOST: z.string(),
  DATABASE_PORT: z.coerce.number(),
  DATABASE_DB: z.string(),
  DB_MIGRATING: z.stringbool().default(false),
  DB_SEEDING: z.stringbool().default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ORIGIN: z.string(),
  DOMAIN: z.string(),
  HOST: z.string().optional(),
  REDIS_URL: z.string(),
  SIGNING_SECRET: z.string().min(1, 'SIGNING_SECRET must not be empty'),
  ENV: z.enum(['dev', 'prod']),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.coerce.number(),
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  STORAGE_HOST: z.string(),
  STORAGE_PORT: z.coerce.number(),
  STORAGE_ACCESS_KEY: z.string(),
  STORAGE_SECRET_KEY: z.string(),
  STORAGE_SSL: z.stringbool().default(false),
  STORAGE_URL: z.string(),
  PUBLIC_IMAGE_URI: z.string(),
  // Storage buckets are named `${PROJECT_NAME}-{public|private}-${ENVIRONMENT}`
  ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('development'),
  PROJECT_NAME: z.string().min(1).default('adelie'),
  SITE_VERSION: z.string().optional(),
  // Security: trusted-proxy handling and the rate-limit kill switch (see rate-limit middleware).
  TRUST_PROXY: z.stringbool().default(false),
  DISABLE_RATE_LIMIT: z.stringbool().default(false),
  // Observability: Sentry + OpenTelemetry.
  SENTRY_BACKEND_URL: z.union([z.url(), z.literal('')]).optional(),
  OTEL_ENABLED: z.stringbool().default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().default('http://localhost:4318/v1/traces'),
});

export type EnvsDto = z.infer<typeof envsDto>;
