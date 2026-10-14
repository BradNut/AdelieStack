import { Container } from '@needle-di/core';
import type { Context } from 'hono';
import { RedisStore, rateLimiter } from 'hono-rate-limiter';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import type { HonoEnv } from '#lib/server/api/common/utils/hono';
import { adaptIoredisForHonoRateLimiter } from '#lib/server/api/common/utils/hono-rate-limiter-redis-client';
import { getClientIp } from '#lib/server/api/common/utils/ip';
import { RedisService } from '#lib/server/api/databases/redis/redis.service';

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
