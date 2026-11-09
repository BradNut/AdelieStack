import 'varlock/auto-load';
import { getTableName, is, sql, Table } from 'drizzle-orm';
import { drizzleAuthDatabase } from '#lib/server/api/auth/auth.config';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { createScriptDb } from './drizzle.client';
import * as schema from './drizzle-schema';
import * as seeds from './seeds';
import { createSeedAuth } from './seeds/auth-options';

if (!process.env.DB_SEEDING) {
  throw new Error('You must set DB_SEEDING to "true" when running seeds');
}

const db = createScriptDb();

const tables = (Object.values(schema) as unknown[]).filter((value): value is Table => is(value, Table));
for (const table of tables) {
  await db.execute(sql.raw(`TRUNCATE TABLE ${getTableName(table)} RESTART IDENTITY CASCADE`));
}

const envs = new ConfigService().envs;
const auth = createSeedAuth(drizzleAuthDatabase(db), envs);

const { ADMIN_EMAIL, ADMIN_PASSWORD, SIGN_UP_ENABLED } = envs;
await seeds.users(auth, { adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD, signUpEnabled: SIGN_UP_ENABLED });

await db.$client.end();
process.exit();
