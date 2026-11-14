import { Environment, NodeEnv } from '@adelie/shared';
import { sql } from 'drizzle-orm';
import Pool from 'pg-pool';
import { describe, expect, it, vi } from 'vitest';
import { createPostgresDb, createScriptDb, SCRIPT_DB_FLAGS } from '#lib/server/api/databases/postgres/drizzle.client';
import { PostgresSslMode } from '#lib/server/api/databases/postgres/postgres-ssl';

describe('createScriptDb', () => {
  describe.each(Object.values(SCRIPT_DB_FLAGS))('%s', (requiredEnvVar) => {
    it('holds one connection when the flag is "true"', () => {
      vi.stubEnv(requiredEnvVar, 'true');
      vi.stubEnv('ENVIRONMENT', Environment.DEVELOPMENT);

      expect(createScriptDb(requiredEnvVar).$client.options.max).toBe(1);
    });

    // Varlock resolves "TRUE", "1" and "yes" to "true" before a script's guard runs, so the guard itself only accepts "true".
    it.each([
      { name: 'unset', value: undefined },
      { name: 'empty', value: '' },
      { name: '"false"', value: 'false' },
      { name: '"TRUE"', value: 'TRUE' },
      { name: '"1"', value: '1' },
      { name: '"yes"', value: 'yes' },
    ])('refuses when the flag is $name', ({ value }) => {
      vi.stubEnv(requiredEnvVar, value);

      expect(() => createScriptDb(requiredEnvVar)).toThrowError(`You must set ${requiredEnvVar} to "true"`);
    });
  });

  it.each([
    { mode: undefined, ssl: false },
    { mode: PostgresSslMode.DISABLE, ssl: false },
    { mode: PostgresSslMode.VERIFY_FULL, ssl: { rejectUnauthorized: true } },
    { mode: PostgresSslMode.REQUIRE, ssl: { rejectUnauthorized: false } },
  ])('connects with ssl $ssl when DATABASE_SSL_MODE is $mode', ({ mode, ssl }) => {
    vi.stubEnv(SCRIPT_DB_FLAGS.MIGRATING, 'true');
    vi.stubEnv('DATABASE_SSL_MODE', mode);

    expect(createScriptDb(SCRIPT_DB_FLAGS.MIGRATING).$client.options.ssl).toEqual(ssl);
  });

  it('does not accept one flag in place of the other', () => {
    vi.stubEnv(SCRIPT_DB_FLAGS.MIGRATING, 'true');
    vi.stubEnv(SCRIPT_DB_FLAGS.SEEDING, 'false');

    expect(() => createScriptDb(SCRIPT_DB_FLAGS.SEEDING)).toThrowError('You must set DB_SEEDING to "true"');
  });

  describe('the seed allow-list', () => {
    it('seeds in development', () => {
      vi.stubEnv(SCRIPT_DB_FLAGS.SEEDING, 'true');
      vi.stubEnv('ENVIRONMENT', Environment.DEVELOPMENT);

      expect(createScriptDb(SCRIPT_DB_FLAGS.SEEDING).$client.options.max).toBe(1);
    });

    const refusedEnvironments = [
      { name: 'staging', value: Environment.STAGING },
      { name: 'production', value: Environment.PRODUCTION },
      { name: 'unset', value: undefined },
      { name: 'an unknown value', value: 'dev' },
    ];

    it.each(refusedEnvironments)('refuses to seed when ENVIRONMENT is $name', ({ value }) => {
      vi.stubEnv(SCRIPT_DB_FLAGS.SEEDING, 'true');
      vi.stubEnv('ENVIRONMENT', value);

      expect(() => createScriptDb(SCRIPT_DB_FLAGS.SEEDING)).toThrowError('runs only when ENVIRONMENT is development');
    });

    it.each(refusedEnvironments)('still migrates when ENVIRONMENT is $name', ({ value }) => {
      vi.stubEnv(SCRIPT_DB_FLAGS.MIGRATING, 'true');
      vi.stubEnv('ENVIRONMENT', value);

      expect(createScriptDb(SCRIPT_DB_FLAGS.MIGRATING).$client.options.max).toBe(1);
    });

    it('ignores NODE_ENV', () => {
      vi.stubEnv(SCRIPT_DB_FLAGS.SEEDING, 'true');
      vi.stubEnv('ENVIRONMENT', Environment.DEVELOPMENT);
      vi.stubEnv('NODE_ENV', NodeEnv.PRODUCTION);

      expect(createScriptDb(SCRIPT_DB_FLAGS.SEEDING).$client.options.max).toBe(1);
    });

    it('checks the flag before the environment', () => {
      vi.stubEnv(SCRIPT_DB_FLAGS.SEEDING, 'false');
      vi.stubEnv('ENVIRONMENT', Environment.PRODUCTION);

      expect(() => createScriptDb(SCRIPT_DB_FLAGS.SEEDING)).toThrowError('You must set DB_SEEDING to "true"');
    });
  });
});

describe('createPostgresDb SQL logging', () => {
  /** Runs one query against a pool that answers without a server, and reports whether Drizzle logged its SQL. */
  async function logsQueries(environment: string | undefined): Promise<boolean> {
    vi.spyOn(Pool.prototype, 'query').mockResolvedValue({ rows: [] } as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const db = createPostgresDb({ port: 5432, ssl: false, environment });

    await db.execute(sql`select 1`);

    return log.mock.calls.some(([line]) => String(line).includes('select 1'));
  }

  it('logs queries in development', async () => {
    expect(await logsQueries(Environment.DEVELOPMENT)).toBe(true);
  });

  it.each([
    { name: 'staging', value: Environment.STAGING },
    { name: 'production', value: Environment.PRODUCTION },
    { name: 'unset', value: undefined },
  ])('logs no queries when the Environment is $name', async ({ value }) => {
    expect(await logsQueries(value)).toBe(false);
  });
});
