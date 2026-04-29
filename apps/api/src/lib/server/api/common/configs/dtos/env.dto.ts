import { z } from 'zod';

const stringBoolean = z.coerce
  .string()
  .transform((val) => {
    return val === 'true';
  })
  .default('false');

export const envsDto = z.object({
  DATABASE_USER: z.string(),
  DATABASE_PASSWORD: z.string(),
  DATABASE_HOST: z.string(),
  DATABASE_PORT: z.coerce.number(),
  DATABASE_DB: z.string(),
  DB_MIGRATING: stringBoolean,
  DB_SEEDING: stringBoolean,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ORIGIN: z.string(),
  REDIS_URL: z.string(),
  SIGNING_SECRET: z.string(),
  ENV: z.enum(['dev', 'prod']),
  PORT: z.number({ coerce: true }),
  STORAGE_HOST: z.string(),
  STORAGE_PORT: z.number({ coerce: true }),
  STORAGE_ACCESS_KEY: z.string(),
  STORAGE_SECRET_KEY: z.string()
});

export type EnvsDto = z.infer<typeof envsDto>;
