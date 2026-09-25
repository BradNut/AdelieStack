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
  REDIS_URL: z.string(),
  SIGNING_SECRET: z.string().min(1, 'SIGNING_SECRET must not be empty'),
  ENV: z.enum(['dev', 'prod']),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.coerce.number(),
  STORAGE_HOST: z.string(),
  STORAGE_PORT: z.coerce.number(),
  STORAGE_ACCESS_KEY: z.string(),
  STORAGE_SECRET_KEY: z.string(),
  STORAGE_SSL: z.stringbool().default(false),
  // Storage buckets are named `${PROJECT_NAME}-{public|private}-${ENVIRONMENT}`
  ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('development'),
  PROJECT_NAME: z.string().min(1).default('adelie'),
});

export type EnvsDto = z.infer<typeof envsDto>;
