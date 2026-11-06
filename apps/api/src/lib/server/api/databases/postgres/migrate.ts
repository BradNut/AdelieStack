import 'varlock/auto-load';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import config from '../../../../../../drizzle.config';
import { createScriptDb } from './drizzle.client';

if (!config.out) {
  console.error('No migrations folder specified in drizzle.config.ts');
  process.exit();
}
if (!process.env.DB_MIGRATING) {
  throw new Error('You must set DB_MIGRATING to "true" when running migrations.');
}

const db = createScriptDb();

await migrate(db, { migrationsFolder: config.out });
console.log('Migrations complete');

await db.$client.end();
process.exit();
