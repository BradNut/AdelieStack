import { inject, injectable } from '@needle-di/core';
import { Redis } from 'ioredis';
import { ConfigService } from '../../common/configs/config.service';

@injectable()
export class RedisService {
  private redisClient: Redis | null = null;

  constructor(private readonly configService = inject(ConfigService)) {}

  get redis(): Redis {
    this.redisClient ??= new Redis(this.configService.envs.REDIS_URL, {
      lazyConnect: true,
    });

    return this.redisClient;
  }

  async get(data: { prefix: string; key: string }): Promise<string | null> {
    return this.redis.get(`${data.prefix}:${data.key}`);
  }

  async set(data: { prefix: string; key: string; value: string }): Promise<void> {
    await this.redis.set(`${data.prefix}:${data.key}`, data.value);
  }

  async delete(data: { prefix: string; key: string }): Promise<void> {
    await this.redis.del(`${data.prefix}:${data.key}`);
  }

  async setWithExpiry(data: { prefix: string; key: string; value: string; expiry: number }): Promise<void> {
    await this.redis.set(`${data.prefix}:${data.key}`, data.value, 'EX', Math.floor(data.expiry));
  }

  async scan(data: { prefix: string; pattern: string }): Promise<string[]> {
    const keys: string[] = [];
    const scanPattern = `${data.prefix}:${data.pattern}`;
    let cursor = '0';

    do {
      const result = await this.redis.scan(cursor, 'MATCH', scanPattern, 'COUNT', 100);
      cursor = result[0];
      const foundKeys = result[1];

      // Remove the prefix from the keys to return just the key part
      const cleanKeys = foundKeys.map((key) => key.replace(`${data.prefix}:`, ''));
      keys.push(...cleanKeys);
    } while (cursor !== '0');

    return keys;
  }
}
