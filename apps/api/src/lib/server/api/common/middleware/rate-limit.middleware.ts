import { Container } from '@needle-di/core';
import type { Context } from 'hono';
import { RedisStore, rateLimiter } from 'hono-rate-limiter';
import { RedisService } from '../../databases/redis/redis.service';
import { ConfigService } from '../configs/config.service';
import type { HonoEnv } from '../utils/hono';
import { adaptIoredisForHonoRateLimiter } from '../utils/hono-rate-limiter-redis-client';
import { getClientIp } from '../utils/ip';

const container = new Container();

function getConfigService() {
  return container.get(ConfigService);
}

function getRedisClient() {
  return container.get(RedisService).redis;
}

export function rateLimit({ limit, minutes, key = '' }: { limit: number; minutes: number; key?: string }) {
  const configService = getConfigService();

  // Kill switch for tests and controlled environments.
  if (configService.envs.DISABLE_RATE_LIMIT) {
    return async (_c: Context<HonoEnv>, next: () => Promise<void>) => {
      await next();
    };
  }

  return rateLimiter({
    windowMs: minutes * 60 * 1000, // every x minutes
    limit, // Limit each key to `limit` requests per `window`.
    standardHeaders: 'draft-6', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    keyGenerator: (c: Context<HonoEnv>) => {
      // Prefer the authenticated user; otherwise a trusted client IP that a client cannot spoof.
      const clientKey = c.var.session?.userId || getClientIp(c, configService.envs.TRUST_PROXY);
      const pathKey = key || c.req.path;
      return `${clientKey}_${pathKey}`;
    },
    // Redis store configuration
    store: new RedisStore({
      client: adaptIoredisForHonoRateLimiter(getRedisClient),
    }) as never,
  });
}
