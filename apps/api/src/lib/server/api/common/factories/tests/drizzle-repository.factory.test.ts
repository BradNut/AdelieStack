import { describe, expect, it } from 'vitest';
import { DrizzleService } from '../../../databases/postgres/drizzle.service';
import { CredentialsRepository } from '../../../users/credentials.repository';
import { UsersRepository } from '../../../users/users.repository';
import { ConfigService } from '../../configs/config.service';
import { createTestContainer, mockProvider } from '../../testing/test-container';

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

    const credentials = container.get(CredentialsRepository);
    const users = container.get(UsersRepository);
    const drizzleService = container.get(DrizzleService);

    // Repository internals are the only way to observe which DrizzleService instance each
    // repository is holding on to, which is exactly what the connection-multiplication bug hid.
    expect((credentials as unknown as { drizzle: DrizzleService }).drizzle).toBe(drizzleService);
    expect((users as unknown as { drizzle: DrizzleService }).drizzle).toBe(drizzleService);
  });
});
