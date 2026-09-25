import { injectable } from '@needle-di/core';
import dayjs from 'dayjs';
import { RedisRepository } from '../../common/factories/redis-repository.factory';
import { type CreateSessionDto, createSessionDto } from './dtos/create-session-dto';

@injectable()
export class SessionsRepository extends RedisRepository<'session'> {
  constructor() {
    super('session');
  }

  async get(id: string): Promise<CreateSessionDto | null> {
    const response = await this.redis.get({ prefix: this.prefix, key: id });
    if (!response) return null;
    return createSessionDto.parse(JSON.parse(response));
  }

  delete(id: string) {
    return this.redis.delete({ prefix: this.prefix, key: id });
  }

  create(createSessionDto: CreateSessionDto) {
    // `setWithExpiry` takes a TTL in seconds-from-now (ioredis `EX`), not an absolute epoch.
    const ttlSeconds = dayjs(createSessionDto.expiresAt).diff(dayjs(), 'second');

    // Already-expired sessions must not be (re)written to Redis with a bogus/negative TTL.
    if (ttlSeconds <= 0) {
      return Promise.resolve();
    }

    return this.redis.setWithExpiry({
      prefix: this.prefix,
      key: createSessionDto.id,
      value: JSON.stringify(createSessionDto),
      expiry: ttlSeconds,
    });
  }
}
