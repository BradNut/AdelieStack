import { afterEach, describe, expect, it } from 'vitest';
import { setProcessEnvs, validEnvs } from '#lib/server/api/common/configs/tests/env-fixtures';
import { createTestContainer } from '#lib/server/api/common/testing/test-container';
import { DrizzleService } from '#lib/server/api/databases/postgres/drizzle.service';

/** pg-pool's own default, which the API runs with. A pool connects on first query, so none of this opens a socket. */
const DEFAULT_POOL_SIZE = 10;

describe('DrizzleService pool size', () => {
  afterEach(() => {
    setProcessEnvs(validEnvs);
  });

  it.each([
    { name: 'neither flag', flags: { DB_MIGRATING: undefined, DB_SEEDING: undefined } },
    { name: 'DB_MIGRATING', flags: { DB_MIGRATING: 'true', DB_SEEDING: 'false' } },
    { name: 'DB_SEEDING', flags: { DB_MIGRATING: 'false', DB_SEEDING: 'true' } },
    { name: 'both flags', flags: { DB_MIGRATING: 'true', DB_SEEDING: 'true' } },
  ])('uses the normal pool with $name set', ({ flags }) => {
    setProcessEnvs({ ...validEnvs, ...flags });

    const { db } = createTestContainer().get(DrizzleService);

    // DrizzleService types `db` without the pool, which is the only place its size can be observed.
    expect((db as unknown as { $client: { options: { max: number } } }).$client.options.max).toBe(DEFAULT_POOL_SIZE);
  });
});
