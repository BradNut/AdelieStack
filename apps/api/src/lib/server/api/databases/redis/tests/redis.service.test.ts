import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '#lib/server/api/common/configs/config.service';
import { RedisService } from '#lib/server/api/databases/redis/redis.service';

type Reply = [Error | null, unknown];

/** A Redis double that records the transaction's commands in order and answers `exec` with `replies`. */
function buildService(replies: Reply[] | null) {
  const commands: unknown[][] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      commands.push([name, ...args]);
      return transaction;
    };
  const transaction = { set: record('set'), incr: record('incr'), ttl: record('ttl'), exec: async () => replies };
  const service = new RedisService({ envs: { REDIS_URL: 'redis://localhost:6379' } } as ConfigService);
  const redisGetter = vi.spyOn(service, 'redis', 'get').mockReturnValue({ multi: () => transaction } as unknown as Redis);
  return { service, commands, redisGetter };
}

const data = { prefix: 'auth-rate-limit', key: 'ip|/sign-in/email', expiry: 60.9 };

describe('RedisService.incrementWithExpiry', () => {
  it('starts the expiry only if the key is new, then counts and reads the time left, in one transaction', async () => {
    const { service, commands } = buildService([
      [null, 'OK'],
      [null, 1],
      [null, 60],
    ]);

    await service.incrementWithExpiry(data);

    expect(commands).toEqual([
      ['set', 'auth-rate-limit:ip|/sign-in/email', 0, 'EX', 60, 'NX'],
      ['incr', 'auth-rate-limit:ip|/sign-in/email'],
      ['ttl', 'auth-rate-limit:ip|/sign-in/email'],
    ]);
  });

  it('returns the count so far and the seconds left in the window', async () => {
    const { service } = buildService([
      [null, null],
      [null, 4],
      [null, 37],
    ]);

    expect(await service.incrementWithExpiry(data)).toEqual({ count: 4, ttl: 37 });
  });

  it('throws the Redis error when a command in the transaction failed', async () => {
    const { service } = buildService([
      [null, 'OK'],
      [new Error('WRONGTYPE'), undefined],
      [null, 60],
    ]);

    await expect(service.incrementWithExpiry(data)).rejects.toThrow('WRONGTYPE');
  });

  it('throws when the transaction was discarded', async () => {
    const { service } = buildService(null);

    await expect(service.incrementWithExpiry(data)).rejects.toThrow('discarded');
  });

  it('throws on a reply that is not a number rather than guessing', async () => {
    const { service } = buildService([
      [null, 'OK'],
      [null, 'oops'],
      [null, 60],
    ]);

    await expect(service.incrementWithExpiry(data)).rejects.toThrow('Unexpected Redis reply');
  });

  it('opens no connection until it is used', () => {
    const { redisGetter } = buildService([]);

    expect(redisGetter).not.toHaveBeenCalled();
  });
});
