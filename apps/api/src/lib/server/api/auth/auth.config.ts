import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { uuidv7 } from '../common/utils/crypto';
import type * as drizzleSchema from '../databases/postgres/drizzle-schema';

/** Better Auth mounts its handler here; the Hono app routes `${AUTH_BASE_PATH}/*` to it. */
export const AUTH_BASE_PATH = '/api/auth';

export interface CreateAuthOptions {
  db: NodePgDatabase<typeof drizzleSchema>;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
}

/** Auth tables use `text` ids from our uuidv7 so they sort by creation time like domain ids. */
export function generateAuthId(): string {
  return uuidv7();
}

/**
 * Builds the Better Auth instance. Pure: it opens no connections, so callers control when
 * it is created (lazily at runtime via {@link AuthService}, or with a mock db for the CLI).
 */
export function createAuth({ db, secret, baseURL, trustedOrigins }: CreateAuthOptions) {
  return betterAuth({
    appName: 'AdelieStack',
    secret,
    baseURL,
    basePath: AUTH_BASE_PATH,
    trustedOrigins,
    database: drizzleAdapter(db, { provider: 'pg', usePlural: true }),
    emailAndPassword: {
      enabled: true,
    },
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
