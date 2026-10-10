import 'dotenv/config';
import { APP_NAME } from '@adelie/shared';
import { getTableName, sql, type Table } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import Pool from 'pg-pool';
import { AUTH_PLACEHOLDER, createAuth, drizzleAuthDatabase } from '../../auth/auth.config';
import { ConfigService } from '../../common/configs/config.service';
import * as drizzleSchema from './drizzle-schema';
import * as schema from './drizzle-schema';
import * as seeds from './seeds';

if (!process.env.DB_SEEDING) {
  throw new Error('You must set DB_SEEDING to "true" when running seeds');
}

async function resetTable(db: NodePgDatabase<typeof schema>, table: Table) {
  return db.execute(sql.raw(`TRUNCATE TABLE ${getTableName(table)} RESTART IDENTITY CASCADE`));
}

const db = drizzle(
  new Pool({
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT).valueOf(),
    database: process.env.DATABASE_DB,
    ssl: false,
    max: process.env.DB_MIGRATING || process.env.DB_SEEDING ? 1 : undefined,
  }),
  {
    casing: 'snake_case',
    schema: drizzleSchema,
    logger: process.env.ENV !== 'prod',
  },
);

for (const table of [
  schema.accounts,
  schema.audit_log_table,
  schema.passkeys,
  schema.sessions,
  schema.twoFactors,
  schema.users,
  schema.verifications,
]) {
  // await db.delete(table); // clear tables without truncating / resetting ids
  await resetTable(db, table);
}

const auth = createAuth({
  database: drizzleAuthDatabase(db),
  secret: `${process.env.BETTER_AUTH_SECRET}`,
  baseURL: `${process.env.BETTER_AUTH_URL}`,
  trustedOrigins: [],
  twoFactorIssuer: APP_NAME,
  passkey: AUTH_PLACEHOLDER.passkey,
  // Seeding never sends mail.
  mailer: { send: async () => {} },
});

const { ADMIN_EMAIL, ADMIN_PASSWORD } = new ConfigService().envs;
await seeds.users(auth, { adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD });

await db.$client.end();
process.exit();
