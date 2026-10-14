import { injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { DrizzleRepository } from '#lib/server/api/common/factories/drizzle-repository.factory';
import { createTestContainer, mockProvider } from '#lib/server/api/common/testing/test-container';
import { DrizzleService } from '#lib/server/api/databases/postgres/drizzle.service';

@injectable()
class FirstRepository extends DrizzleRepository {}

@injectable()
class SecondRepository extends DrizzleRepository {}

describe('DrizzleRepository DI wiring', () => {
  it('shares one DrizzleService singleton across every repository resolved from the same container', () => {
    const container = createTestContainer(
      mockProvider(ConfigService, {
        envs: {
          DATABASE_USER: 'test',
          DATABASE_PASSWORD: 'test',
          DATABASE_HOST: 'localhost',
          DATABASE_PORT: 5432,
          DATABASE_DB: 'test',
          DB_MIGRATING: false,
          DB_SEEDING: false,
          ENV: 'dev',
        },
      }),
    );

    const first = container.get(FirstRepository);
    const second = container.get(SecondRepository);
    const drizzleService = container.get(DrizzleService);

    // Repository internals are the only way to observe which DrizzleService instance each
    // repository is holding on to, which is exactly what the connection-multiplication bug hid.
    expect((first as unknown as { drizzle: DrizzleService }).drizzle).toBe(drizzleService);
    expect((second as unknown as { drizzle: DrizzleService }).drizzle).toBe(drizzleService);
  });
});
