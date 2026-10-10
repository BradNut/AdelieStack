import { APP_NAME } from '@adelie/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as drizzleSchema from '../databases/postgres/drizzle-schema';
import { AUTH_PLACEHOLDER, createAuth, drizzleAuthDatabase } from './auth.config';

/**
 * Entry point for the Better Auth CLI (`pnpm auth:generate`) only. It reads the plugin set to
 * generate the Drizzle schema, so it uses a mock db and placeholder values: no connection,
 * no env. The runtime instance is built by `AuthService`.
 */
export const auth = createAuth({
  database: drizzleAuthDatabase(drizzle.mock({ casing: 'snake_case', schema: drizzleSchema })),
  secret: AUTH_PLACEHOLDER.secret,
  baseURL: AUTH_PLACEHOLDER.baseURL,
  trustedOrigins: [],
  twoFactorIssuer: APP_NAME,
  passkey: AUTH_PLACEHOLDER.passkey,
  mailer: { send: async () => {} },
});
