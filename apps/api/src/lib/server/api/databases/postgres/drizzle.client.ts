import { isProdEnv } from '@adelie/shared';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Client } from 'pg';
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

type PostgresDb = NodePgDatabase<typeof drizzleSchema> & { $client: Pool<Client> };

/** The env var each one-off script requires to be on before it will run. */
export const SCRIPT_DB_FLAGS = { MIGRATING: 'DB_MIGRATING', SEEDING: 'DB_SEEDING' } as const;

type ScriptDbFlag = (typeof SCRIPT_DB_FLAGS)[keyof typeof SCRIPT_DB_FLAGS];

/** Builds the Drizzle client. A pool connects on its first query, so this opens nothing. */
export function createPostgresDb({ env, ...pool }: PostgresConnection): PostgresDb {
  return drizzle(new Pool({ ...pool, ssl: false }), { ...DRIZZLE_CONFIG, logger: !isProdEnv(env) });
}

/**
 * For one-off scripts (migrate, seed), which read only the variables they need and hold one connection.
 * Refuses unless the script's flag resolves to true. Varlock has already turned `TRUE`, `1` and `yes` into "true";
 * the guard compares strings because `.env.schema` defaults the flag to "false", a truthy string.
 */
export function createScriptDb(requiredEnvVar: ScriptDbFlag): PostgresDb {
  if (process.env[requiredEnvVar] !== 'true') {
    throw new Error(`You must set ${requiredEnvVar} to "true" to run this script.`);
  }
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
