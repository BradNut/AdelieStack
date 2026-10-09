import { injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';
import { RedisService } from '../../../databases/redis/redis.service';
import { ConfigService } from '../../configs/config.service';
import { createTestContainer, mockProvider } from '../../testing/test-container';
import { RedisRepository } from '../redis-repository.factory';

@injectable()
class SessionsRepository extends RedisRepository<'session'> {
  constructor() {
    super('session');
  }
}

@injectable()
class LoginRequestsRepository extends RedisRepository<'login-request'> {
  constructor() {
    super('login-request');
  }
}

describe('RedisRepository DI wiring', () => {
  it('shares one RedisService singleton across every repository resolved from the same container', () => {
    const container = createTestContainer(mockProvider(ConfigService, { envs: { REDIS_URL: 'redis://localhost:6379' } }));

    const sessions = container.get(SessionsRepository);
    const loginRequests = container.get(LoginRequestsRepository);
    const redisService = container.get(RedisService);

    // Repository internals are the only way to observe which RedisService instance each
    // repository is holding on to, which is exactly what the connection-multiplication bug hid.
    expect((sessions as unknown as { redis: RedisService }).redis).toBe(redisService);
    expect((loginRequests as unknown as { redis: RedisService }).redis).toBe(redisService);
  });

  it('still gives each repository its own runtime key prefix once the RedisService is shared', () => {
    const container = createTestContainer(mockProvider(ConfigService, { envs: { REDIS_URL: 'redis://localhost:6379' } }));

    const sessions = container.get(SessionsRepository);
    const loginRequests = container.get(LoginRequestsRepository);

    expect(sessions.prefix).toBe('session');
    expect(loginRequests.prefix).toBe('login-request');
  });
});
