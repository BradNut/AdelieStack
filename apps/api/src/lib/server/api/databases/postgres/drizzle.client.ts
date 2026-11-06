import { isProdEnv } from '@adelie/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import Pool from 'pg-pool';
import * as drizzleSchema from './drizzle-schema';

/** Drizzle options every client over our schema shares. `drizzle.config.ts` must use the same casing. */
export const DRIZZLE_CONFIG = { casing: 'snake_case', schema: drizzleSchema } as const;

interface PostgresConnection {
  user?: string;
  password?: string;
  host?: string;
  port: number;
  database?: string;
  max?: number;
  /** The app environment: queries are logged everywhere but production. */
  env?: string;
}

/** Builds the Drizzle client. A pool connects on its first query, so this opens nothing. */
export function createPostgresDb({ env, ...pool }: PostgresConnection) {
  return drizzle(new Pool({ ...pool, ssl: false }), { ...DRIZZLE_CONFIG, logger: !isProdEnv(env) });
}

/** For one-off scripts (migrate, seed), which read only the variables they need and hold one connection. */
export function createScriptDb() {
  return createPostgresDb({
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    database: process.env.DATABASE_DB,
    max: 1,
    env: process.env.ENV,
  });
}
