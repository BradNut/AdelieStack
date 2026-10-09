import { injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';
import { DrizzleService } from '../../../databases/postgres/drizzle.service';
import { ConfigService } from '../../configs/config.service';
import { createTestContainer, mockProvider } from '../../testing/test-container';
import { DrizzleRepository } from '../drizzle-repository.factory';

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
