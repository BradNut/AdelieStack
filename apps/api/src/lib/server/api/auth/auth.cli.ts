import { drizzle } from 'drizzle-orm/node-postgres';
import { DRIZZLE_CONFIG } from '#lib/server/api/databases/postgres/drizzle.client';
import { createOfflineAuth, drizzleAuthDatabase } from './auth.config';

/**
 * Entry point for the Better Auth CLI (`pnpm auth:generate`) only. It reads the plugin set to
 * generate the Drizzle schema, so it uses a mock db and placeholder values: no connection,
 * no env. The runtime instance is built by `AuthService`.
 */
export const auth = createOfflineAuth({ database: drizzleAuthDatabase(drizzle.mock(DRIZZLE_CONFIG)) });
