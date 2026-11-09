import { describe, expect, it, vi } from 'vitest';
import { createScriptDb, SCRIPT_DB_FLAGS } from '#lib/server/api/databases/postgres/drizzle.client';

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

  it('does not accept one flag in place of the other', () => {
    vi.stubEnv(SCRIPT_DB_FLAGS.MIGRATING, 'true');
    vi.stubEnv(SCRIPT_DB_FLAGS.SEEDING, 'false');

    expect(() => createScriptDb(SCRIPT_DB_FLAGS.SEEDING)).toThrowError('You must set DB_SEEDING to "true"');
  });
});
