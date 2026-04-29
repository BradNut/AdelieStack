import 'dotenv/config';
import { type Table, getTableName, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as drizzleSchema from './drizzle-schema';
import * as seeds from './seeds';
import * as schema from './drizzle-schema';
import Pool from 'pg-pool';

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
  schema.credentials_table,
  schema.recovery_codes_table,
  schema.roles_table,
  schema.two_factor_table,
  schema.user_roles_table,
  schema.users_table,
]) {
  // await db.delete(table); // clear tables without truncating / resetting ids
  await resetTable(db, table);
}

await seeds.roles(db);
await seeds.users(db);

await db.$client.end();
process.exit();
