import { AUTH_SESSION_FRESH_AGE } from '@adelie/shared';
import pg from 'pg';

/** The e2e database: the API's default local connection unless the shell overrides a part of it. */
function connectionConfig() {
  return {
    user: process.env.DATABASE_USER ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_DB ?? 'postgres',
  };
}

/**
 * Backdates every session of the user past `AUTH_SESSION_FRESH_AGE`, so the next sensitive action
 * hits SESSION_NOT_FRESH. Only a new sign-in makes a session fresh again.
 */
export async function makeSessionsStale(email: string): Promise<void> {
  const client = new pg.Client(connectionConfig());
  await client.connect();
  try {
    const staleAt = new Date(Date.now() - (AUTH_SESSION_FRESH_AGE + 60) * 1000).toISOString();
    const result = await client.query('UPDATE sessions SET created_at = $1::timestamp WHERE user_id = (SELECT id FROM users WHERE email = $2)', [
      staleAt,
      email,
    ]);
    if (result.rowCount === 0) throw new Error(`No session found for ${email}`);
  } finally {
    await client.end();
  }
}
