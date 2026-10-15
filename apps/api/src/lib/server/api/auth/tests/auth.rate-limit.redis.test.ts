import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTH_RATE_LIMIT_REDIS_PREFIX, AuthRateLimitRepository } from '#lib/server/api/auth/auth.rate-limit.repository';
import type { ConfigService } from '#lib/server/api/common/configs/config.service';
import { RedisService } from '#lib/server/api/databases/redis/redis.service';

/**
 * Runs the auth rate-limit storage against a real Redis, so the atomic count-and-expire step is checked
 * outside mocks. Needs REDIS_URL; run with `pnpm test:redis` (excluded from `pnpm test`).
 */
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) throw new Error('REDIS_URL is required for `pnpm test:redis` (e.g. redis://localhost:6379)');

const redisService = new RedisService({ envs: { REDIS_URL } } as ConfigService);
const repository = new AuthRateLimitRepository(redisService);
const createdKeys: string[] = [];

/** A key no other test or run shares, removed afterwards. */
function uniqueKey() {
  const key = `test-${randomUUID()}|/sign-in/email`;
  createdKeys.push(key);
  return key;
}

const ttlOf = (key: string) => redisService.redis.ttl(`${AUTH_RATE_LIMIT_REDIS_PREFIX}:${key}`);

beforeAll(async () => {
  await redisService.redis.connect();
});

afterAll(async () => {
  await Promise.all(createdKeys.map((key) => redisService.delete({ prefix: AUTH_RATE_LIMIT_REDIS_PREFIX, key })));
  redisService.redis.disconnect();
});

describe('AuthRateLimitRepository against real Redis', () => {
  it('allows requests up to the maximum and refuses the next', async () => {
    const key = uniqueKey();
    const rule = { window: 30, max: 3 };

    for (let i = 0; i < rule.max; i++) expect(await repository.consume(key, rule)).toEqual({ allowed: true, retryAfter: null });

    const refused = await repository.consume(key, rule);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfter).toBeGreaterThan(0);
  });

  it('counts each key separately', async () => {
    const [a, b] = [uniqueKey(), uniqueKey()];
    const rule = { window: 30, max: 1 };

    await repository.consume(a, rule);

    expect((await repository.consume(a, rule)).allowed).toBe(false);
    expect((await repository.consume(b, rule)).allowed).toBe(true);
  });

  it('expires the counter after its window and starts counting again', async () => {
    const key = uniqueKey();
    const rule = { window: 1, max: 1 };

    await repository.consume(key, rule);
    expect((await repository.consume(key, rule)).allowed).toBe(false);

    await sleep(1500);

    expect(await redisService.get({ prefix: AUTH_RATE_LIMIT_REDIS_PREFIX, key })).toBeNull();
    expect(await repository.consume(key, rule)).toEqual({ allowed: true, retryAfter: null });
    expect((await repository.consume(key, rule)).allowed).toBe(false);
  });

  it('never leaves a key without an expiry, whether the request is allowed or refused', async () => {
    const key = uniqueKey();
    const rule = { window: 30, max: 2 };

    for (let i = 0; i < rule.max + 2; i++) {
      await repository.consume(key, rule);
      const ttl = await ttlOf(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(rule.window);
    }
  });

  it('does not extend the window with later hits', async () => {
    const key = uniqueKey();
    const rule = { window: 3, max: 10 };

    await repository.consume(key, rule);
    await sleep(1200);
    await repository.consume(key, rule);

    expect(await ttlOf(key)).toBeLessThanOrEqual(2);
  });

  it('reports a retry time that matches the time left in the window', async () => {
    const key = uniqueKey();
    const rule = { window: 4, max: 1 };

    await repository.consume(key, rule);
    const first = await repository.consume(key, rule);
    expect(first.retryAfter).toBeGreaterThanOrEqual(3);
    expect(first.retryAfter).toBeLessThanOrEqual(rule.window);

    await sleep(2100);

    const later = await repository.consume(key, rule);
    expect(later.retryAfter).toBe(await ttlOf(key));
    expect(later.retryAfter).toBeLessThanOrEqual(2);
    expect(later.retryAfter).toBeGreaterThan(0);
  });
});
