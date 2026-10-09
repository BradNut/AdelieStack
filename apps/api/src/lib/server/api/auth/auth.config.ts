import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { RoleName } from '@adelie/shared';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { uuidv7 } from '../common/utils/crypto';
import type * as drizzleSchema from '../databases/postgres/drizzle-schema';
import { ac, roles } from './auth.permissions';

/** Better Auth mounts its handler here; the Hono app routes `${AUTH_BASE_PATH}/*` to it. */
export const AUTH_BASE_PATH = '/api/auth';

export interface CreateAuthOptions {
  database: BetterAuthOptions['database'];
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
}

/** Better Auth's Drizzle adapter over our schema. Table names are plural (`users`, `sessions`, ...). */
export function drizzleAuthDatabase(db: NodePgDatabase<typeof drizzleSchema>) {
  return drizzleAdapter(db, { provider: 'pg', usePlural: true });
}

/** Auth tables use `text` ids from our uuidv7 so they sort by creation time like domain ids. */
export function generateAuthId(): string {
  return uuidv7();
}

/**
 * Builds the Better Auth instance. Pure: it opens no connections, so callers control when
 * it is created (lazily at runtime via {@link AuthService}, with a mock db for the CLI, or
 * over the memory adapter in tests).
 */
export function createAuth({ database, secret, baseURL, trustedOrigins }: CreateAuthOptions) {
  return betterAuth({
    appName: 'AdelieStack',
    secret,
    baseURL,
    basePath: AUTH_BASE_PATH,
    trustedOrigins,
    database,
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      // Roles live in the user's `role` field. The plugin declares it `input: false`, so no
      // sign-up or update-user body can set it; only admin endpoints (or the server) can.
      admin({
        ac,
        roles,
        defaultRole: RoleName.USER,
        adminRoles: [RoleName.ADMIN],
      }),
    ],
    advanced: {
      database: {
        generateId: generateAuthId,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session']['session'];
export type AuthUser = Auth['$Infer']['Session']['user'];
