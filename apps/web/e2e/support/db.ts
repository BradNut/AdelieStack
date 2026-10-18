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

/**
 * Links a provider account to the user without the provider round trip, as if they had connected it earlier.
 * Only for flows that need a linked provider to exist; no provider is ever contacted.
 */
export async function linkProviderAccount(email: string, providerId: string): Promise<void> {
  const client = new pg.Client(connectionConfig());
  await client.connect();
  try {
    const result = await client.query(
      `INSERT INTO accounts (id, account_id, provider_id, user_id, created_at, updated_at)
       SELECT $1, $2, $3, id, now(), now() FROM users WHERE email = $4`,
      [`e2e-${providerId}-${Date.now()}`, `e2e-${providerId}-subject`, providerId, email],
    );
    if (result.rowCount === 0) throw new Error(`No user found for ${email}`);
  } finally {
    await client.end();
  }
}
