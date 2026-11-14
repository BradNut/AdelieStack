/**
 * How Postgres connections use TLS, named after libpq's `sslmode`. `DATABASE_SSL_MODE` picks one for the API pool, the
 * migrate and seed scripts and the Drizzle tooling alike. Kept free of other imports so `drizzle.config.ts` can load it.
 */
export const PostgresSslMode = {
  /** No TLS: local development, where Postgres runs on the same host or Docker network. */
  DISABLE: 'disable',
  /** TLS, with the server certificate checked against the trusted CAs and the host name. */
  VERIFY_FULL: 'verify-full',
  /** TLS without checking the certificate: an explicit opt-out that leaves the connection open to impersonation. */
  REQUIRE: 'require',
} as const;

export type PostgresSslMode = (typeof PostgresSslMode)[keyof typeof PostgresSslMode];

export const POSTGRES_SSL_MODES = Object.values(PostgresSslMode) as [PostgresSslMode, ...PostgresSslMode[]];

/** The `ssl` option node-postgres and drizzle-kit take: off, or TLS with or without certificate verification. */
export type PostgresSslOptions = false | { rejectUnauthorized: boolean };

const isPostgresSslMode = (value: string): value is PostgresSslMode => (POSTGRES_SSL_MODES as readonly string[]).includes(value);

/**
 * Turns `DATABASE_SSL_MODE` into the connection's `ssl` option. Unset or empty means `disable`, so local development
 * needs no setting; an unknown value throws rather than quietly connecting in the clear.
 */
export function postgresSsl(mode: string | undefined): PostgresSslOptions {
  if (mode === undefined || mode === '') return false;
  if (!isPostgresSslMode(mode)) {
    throw new Error(`DATABASE_SSL_MODE must be one of ${POSTGRES_SSL_MODES.join(', ')}; got "${mode}"`);
  }
  if (mode === PostgresSslMode.DISABLE) return false;
  return { rejectUnauthorized: mode === PostgresSslMode.VERIFY_FULL };
}
