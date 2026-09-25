import { inject } from '@needle-di/core';
import { RedisService } from '../../databases/redis/redis.service';

export abstract class RedisRepository<T extends string> {
  protected readonly redis: RedisService;
  readonly prefix: T;

  constructor(prefix: T, redis = inject(RedisService)) {
    this.prefix = prefix;
    this.redis = redis;
  }
}
