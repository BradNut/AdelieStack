import { describe, expect, it, vi } from 'vitest';
import { createAuth } from '#lib/server/api/auth/auth.config';
import { AuthRateLimitRepository } from '#lib/server/api/auth/auth.rate-limit.repository';
import { AuthService } from '#lib/server/api/auth/auth.service';
import type { ConfigService } from '#lib/server/api/common/configs/config.service';
import { envsDto } from '#lib/server/api/common/configs/dtos/env.dto';
import { validEnvs } from '#lib/server/api/common/configs/tests/env-fixtures';
import type { LoggerService } from '#lib/server/api/common/services/logger.service';
import type { DrizzleService } from '#lib/server/api/databases/postgres/drizzle.service';
import type { RedisService } from '#lib/server/api/databases/redis/redis.service';
import type { MailerService } from '#lib/server/api/mail/mailer.service';
import { createRedisServiceMock } from '../../../../../test/mocks/redis.mock';

vi.mock('#lib/server/api/auth/auth.config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/server/api/auth/auth.config')>()),
  createAuth: vi.fn(() => ({})),
  drizzleAuthDatabase: vi.fn(),
}));

describe('AuthService mail logging', () => {
  it('gives the auth instance its logger, without which a failed Security Event email goes unlogged', () => {
    const log = { error: vi.fn(), warn: vi.fn() };
    const service = new AuthService(
      { envs: envsDto.parse(validEnvs) } as ConfigService,
      {} as DrizzleService,
      { send: async () => {} } as unknown as MailerService,
      { log } as unknown as LoggerService,
      new AuthRateLimitRepository(createRedisServiceMock() as unknown as RedisService),
    );

    void service.auth;

    expect(vi.mocked(createAuth).mock.calls[0][0].mailLog).toBe(log);
  });
});
