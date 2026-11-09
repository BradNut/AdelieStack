import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScriptDb } from '#lib/server/api/databases/postgres/drizzle.client';

describe.each(['DB_MIGRATING', 'DB_SEEDING'] as const)('createScriptDb(%s)', (flag) => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('holds one connection when the flag is "true"', () => {
    vi.stubEnv(flag, 'true');

    expect(createScriptDb(flag).$client.options.max).toBe(1);
  });

  it.each([
    { name: 'unset', value: undefined },
    { name: 'empty', value: '' },
    { name: '"false"', value: 'false' },
  ])('refuses when the flag is $name', ({ value }) => {
    vi.stubEnv(flag, value);

    expect(() => createScriptDb(flag)).toThrowError(`You must set ${flag} to "true"`);
  });
});

it('does not accept one flag in place of the other', () => {
  vi.stubEnv('DB_MIGRATING', 'true');
  vi.stubEnv('DB_SEEDING', 'false');

  expect(() => createScriptDb('DB_SEEDING')).toThrowError('You must set DB_SEEDING to "true"');
});
