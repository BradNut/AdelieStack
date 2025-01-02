import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as drizzleSchema from './drizzle-schema';
import config from '../../../../../../drizzle.config';
import Pool from 'pg-pool';
import { drizzle } from 'drizzle-orm/node-postgres';

if (!config.out) {
  console.error('No migrations folder specified in drizzle.config.ts');
  process.exit();
}
if (!process.env.DB_MIGRATING) {
  throw new Error('You must set DB_MIGRATING to "true" when running migrations.');
}

const db = drizzle(
  new Pool({
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT).valueOf(),
    database: process.env.DATABASE_DB,
    ssl: false,
    max: 1,
  }),
  {
    casing: 'snake_case',
    schema: drizzleSchema,
    logger: process.env.ENV !== 'prod',
  },
);

await migrate(db, { migrationsFolder: config.out });
console.log('Migrations complete');

await db.$client.end();
process.exit();
