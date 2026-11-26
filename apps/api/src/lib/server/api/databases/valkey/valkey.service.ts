import { inject, injectable } from '@needle-di/core';
import { Redis } from 'ioredis';
import { ConfigService } from '#lib/server/api/common/configs/config.service';

@injectable()
export class ValkeyService {
  private connection: Redis | null = null;

  constructor(private readonly configService = inject(ConfigService)) {}

  get client(): Redis {
    this.connection ??= new Redis(this.configService.envs.VALKEY_URL, {
      lazyConnect: true,
    });

    return this.connection;
  }

  async get(data: { prefix: string; key: string }): Promise<string | null> {
    return this.client.get(`${data.prefix}:${data.key}`);
  }

  async set(data: { prefix: string; key: string; value: string }): Promise<void> {
    await this.client.set(`${data.prefix}:${data.key}`, data.value);
  }

  async delete(data: { prefix: string; key: string }): Promise<void> {
    await this.client.del(`${data.prefix}:${data.key}`);
  }

  async setWithExpiry(data: { prefix: string; key: string; value: string; expiry: number }): Promise<void> {
    await this.client.set(`${data.prefix}:${data.key}`, data.value, 'EX', Math.floor(data.expiry));
  }

  /**
   * Counts one hit on `prefix:key` in a fixed window. The expiry starts with the first hit and is not
   * extended by later ones. The three commands run as one transaction, so a crash cannot leave a counter
   * without an expiry. Returns the count so far and the seconds left in the window.
   */
  async incrementWithExpiry(data: { prefix: string; key: string; expiry: number }): Promise<{ count: number; ttl: number }> {
    const namespacedKey = `${data.prefix}:${data.key}`;
    const replies = await this.client
      .multi()
      .set(namespacedKey, 0, 'EX', Math.floor(data.expiry), 'NX')
      .incr(namespacedKey)
      .ttl(namespacedKey)
      .exec();
    const failure = replies?.find(([error]) => error)?.[0];
    if (!replies || failure) throw failure ?? new Error(`Valkey transaction for ${namespacedKey} was discarded`);

    const [count, ttl] = [replies[1][1], replies[2][1]];
    if (typeof count !== 'number' || typeof ttl !== 'number') throw new Error(`Unexpected Valkey reply counting ${namespacedKey}`);
    return { count, ttl };
  }

  /**
   * Counts one hit on `prefix:key` and restarts its expiry, so the count lasts until `expiry` seconds pass without a
   * hit. Both commands run as one transaction, so a crash cannot leave a counter without an expiry. Returns the count.
   */
  async incrementWithIdleExpiry(data: { prefix: string; key: string; expiry: number }): Promise<number> {
    const namespacedKey = `${data.prefix}:${data.key}`;
    const replies = await this.client.multi().incr(namespacedKey).expire(namespacedKey, Math.floor(data.expiry)).exec();
    const failure = replies?.find(([error]) => error)?.[0];
    if (!replies || failure) throw failure ?? new Error(`Valkey transaction for ${namespacedKey} was discarded`);

    const count = replies[0][1];
    if (typeof count !== 'number') throw new Error(`Unexpected Valkey reply counting ${namespacedKey}`);
    return count;
  }

  /** Seconds until `prefix:key` expires: -1 when it has no expiry, -2 when it does not exist. */
  async ttl(data: { prefix: string; key: string }): Promise<number> {
    return this.client.ttl(`${data.prefix}:${data.key}`);
  }

  async scan(data: { prefix: string; pattern: string }): Promise<string[]> {
    const keys: string[] = [];
    const scanPattern = `${data.prefix}:${data.pattern}`;
    let cursor = '0';

    do {
      const result = await this.client.scan(cursor, 'MATCH', scanPattern, 'COUNT', 100);
      cursor = result[0];
      const foundKeys = result[1];

      // Remove the prefix from the keys to return just the key part
      const cleanKeys = foundKeys.map((key) => key.replace(`${data.prefix}:`, ''));
      keys.push(...cleanKeys);
    } while (cursor !== '0');

    return keys;
  }
}
