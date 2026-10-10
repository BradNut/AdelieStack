import { drizzle } from 'drizzle-orm/node-postgres';
import * as drizzleSchema from '../databases/postgres/drizzle-schema';
import { createAuth, drizzleAuthDatabase } from './auth.config';

/**
 * Entry point for the Better Auth CLI (`pnpm auth:generate`) only. It reads the plugin set to
 * generate the Drizzle schema, so it uses a mock db and placeholder values: no connection,
 * no env. The runtime instance is built by `AuthService`.
 */
export const auth = createAuth({
  database: drizzleAuthDatabase(drizzle.mock({ casing: 'snake_case', schema: drizzleSchema })),
  secret: 'better-auth-cli-placeholder-secret-0000',
  baseURL: 'http://localhost',
  trustedOrigins: [],
  twoFactorIssuer: 'AdelieStack',
  passkey: { rpID: 'localhost', rpName: 'AdelieStack', origin: 'http://localhost' },
  mailer: { send: async () => {} },
});
