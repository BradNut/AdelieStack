import { defineConfig } from 'drizzle-kit';

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
		port: Number(process.envDATABASE_PORT) || 5432,
		user: process.envDATABASE_USER,
		password: process.envDATABASE_PASSWORD,
		database: process.envDATABASE_DB || 'acme',
		ssl: process.envDATABASE_HOST !== 'localhost',
	},
	migrations: {
		table: 'migrations',
		schema: 'public'
	}
});
