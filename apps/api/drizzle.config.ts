import { defineConfig } from 'drizzle-kit';
import { postgresSsl } from './src/lib/server/api/databases/postgres/postgres-ssl';

/* ------------------------------- !IMPORTANT ------------------------------- */
/* ---------------- Before running migrations or generations ---------------- */
/* ------------------ make sure to build the project first ------------------ */
/* -------------------------------------------------------------------------- */

export default defineConfig({
  out: './drizzle',
  schema: './src/lib/server/api/databases/postgres/drizzle-schema.ts',
  breakpoints: false,
  strict: true,
  verbose: true,
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT) || 5432,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_DB || 'acme',
    ssl: postgresSsl(process.env.DATABASE_SSL_MODE),
  },
  migrations: {
    table: 'migrations',
    schema: 'public',
  },
});
