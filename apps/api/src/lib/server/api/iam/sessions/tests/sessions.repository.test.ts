import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisServiceMock } from '../../../../../../test/mocks/redis.mock';
import { buildSession, TEST_NOW } from '../../../common/testing/factories';
import { createTestContainer, mockProvider } from '../../../common/testing/test-container';
import { RedisService } from '../../../databases/redis/redis.service';
import { SessionsRepository } from '../sessions.repository';

describe('SessionsRepository', () => {
  let redis: ReturnType<typeof createRedisServiceMock>;

  function createRepository() {
    return createTestContainer(mockProvider(RedisService, redis)).get(SessionsRepository);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TEST_NOW);
    redis = createRedisServiceMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores the session under the "session" Redis key prefix', async () => {
    const session = buildSession();

    await createRepository().create(session);

    expect(redis.setWithExpiry).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ prefix: 'session', key: session.id }));
    expect([...redis.store.keys()]).toEqual([`session:${session.id}`]);
  });

  it('passes a small seconds-from-now TTL to Redis, not the absolute expiry epoch', async () => {
    const session = buildSession();

    await createRepository().create(session);

    const call = redis.setWithExpiry.mock.calls[0]?.[0];
    expect(call?.expiry).toBe(30 * 24 * 60 * 60);
    // Sanity check that we didn't regress to passing the absolute epoch (a much larger number).
    expect(call?.expiry).toBeLessThan(Math.floor(+session.expiresAt / 1000));
  });

  it('does not write an already-expired session to Redis', async () => {
    const session = buildSession({ expiresAt: new Date(TEST_NOW.getTime() - 1000) });

    await createRepository().create(session);

    expect(redis.setWithExpiry).not.toHaveBeenCalled();
  });

  it('reads a session back through the "session" prefix', async () => {
    const session = buildSession();
    await createRepository().create(session);

    const result = await createRepository().get(session.id);

    expect(result).toMatchObject({ id: session.id, userId: session.userId });
  });

  it('deletes a session under the "session" prefix', async () => {
    const session = buildSession();
    await createRepository().create(session);

    await createRepository().delete(session.id);

    expect(redis.delete).toHaveBeenCalledExactlyOnceWith({ prefix: 'session', key: session.id });
    expect(redis.store.has(`session:${session.id}`)).toBe(false);
  });
});
