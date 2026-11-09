import 'varlock/auto-load';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import config from '../../../../../../drizzle.config';
import { createScriptDb } from './drizzle.client';

if (!config.out) {
  console.error('No migrations folder specified in drizzle.config.ts');
  process.exit();
}

const db = createScriptDb('DB_MIGRATING');

await migrate(db, { migrationsFolder: config.out });
console.log('Migrations complete');

await db.$client.end();
process.exit();
