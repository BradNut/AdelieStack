import { describe, expect, it } from 'vitest';
import { createRedisServiceMock } from '../../../../../../test/mocks/redis.mock';
import { createTestContainer, mockProvider } from '../../../common/testing/test-container';
import { RedisService } from '../../../databases/redis/redis.service';
import { LoginRequestsRepository } from '../login-requests.repository';

describe('LoginRequestsRepository', () => {
  function createRepository(redis: ReturnType<typeof createRedisServiceMock>) {
    return createTestContainer(mockProvider(RedisService, redis)).get(LoginRequestsRepository);
  }

  it('stores login requests under the "login-request" Redis key prefix', async () => {
    const redis = createRedisServiceMock();

    await createRepository(redis).set({ email: 'Penguin@Example.com', hashedCode: 'hashed-code' });

    expect(redis.setWithExpiry).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ prefix: 'login-request', key: 'penguin@example.com' }));
    expect([...redis.store.keys()]).toEqual(['login-request:penguin@example.com']);
  });

  it('reads and deletes login requests through the same prefix', async () => {
    const redis = createRedisServiceMock();
    await createRepository(redis).set({ email: 'penguin@example.com', hashedCode: 'hashed-code' });

    await expect(createRepository(redis).get('penguin@example.com')).resolves.toEqual({
      email: 'penguin@example.com',
      hashedCode: 'hashed-code',
    });

    await createRepository(redis).delete('penguin@example.com');
    expect(redis.delete).toHaveBeenCalledExactlyOnceWith({ prefix: 'login-request', key: 'penguin@example.com' });
  });

  it('returns null when no login request is stored for the email', async () => {
    const redis = createRedisServiceMock();

    await expect(createRepository(redis).get('missing@example.com')).resolves.toBeNull();
  });
});
