import { AppEnv, DeployEnvironment, NodeEnv } from '@adelie/shared';
import { describe, expect, it, vi } from 'vitest';
import { createScriptDb, SCRIPT_DB_FLAGS } from '#lib/server/api/databases/postgres/drizzle.client';
import { PostgresSslMode } from '#lib/server/api/databases/postgres/postgres-ssl';

describe('createScriptDb', () => {
  describe.each(Object.values(SCRIPT_DB_FLAGS))('%s', (requiredEnvVar) => {
    it('holds one connection when the flag is "true"', () => {
      vi.stubEnv(requiredEnvVar, 'true');

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

  describe('in production', () => {
    const productionSettings = [
      { name: 'ENV=prod', envs: { ENV: AppEnv.PROD } },
      { name: 'NODE_ENV=production', envs: { NODE_ENV: NodeEnv.PRODUCTION } },
      { name: 'ENVIRONMENT=production', envs: { ENVIRONMENT: DeployEnvironment.PRODUCTION } },
    ];

    function stubEnvs(envs: Record<string, string | undefined>) {
      for (const [name, value] of Object.entries(envs)) vi.stubEnv(name, value);
    }

    it.each(productionSettings)('refuses to seed when $name', ({ envs }) => {
      vi.stubEnv(SCRIPT_DB_FLAGS.SEEDING, 'true');
      stubEnvs(envs);

      expect(() => createScriptDb(SCRIPT_DB_FLAGS.SEEDING)).toThrowError('refuses to run in production');
    });

    it.each(productionSettings)('still migrates when $name', ({ envs }) => {
      vi.stubEnv(SCRIPT_DB_FLAGS.MIGRATING, 'true');
      stubEnvs(envs);

      expect(createScriptDb(SCRIPT_DB_FLAGS.MIGRATING).$client.options.max).toBe(1);
    });

    it('seeds a staging deploy that is not a production build', () => {
      vi.stubEnv(SCRIPT_DB_FLAGS.SEEDING, 'true');
      stubEnvs({ ENV: AppEnv.DEV, NODE_ENV: NodeEnv.DEVELOPMENT, ENVIRONMENT: DeployEnvironment.STAGING });

      expect(createScriptDb(SCRIPT_DB_FLAGS.SEEDING).$client.options.max).toBe(1);
    });

    it('checks the flag before the environment', () => {
      vi.stubEnv(SCRIPT_DB_FLAGS.SEEDING, 'false');
      stubEnvs({ ENV: AppEnv.PROD });

      expect(() => createScriptDb(SCRIPT_DB_FLAGS.SEEDING)).toThrowError('You must set DB_SEEDING to "true"');
    });
  });
});
