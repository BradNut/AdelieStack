import { Container } from '@needle-di/core';
import type { Context } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { LoggerService } from '#lib/server/api/common/services/logger.service';
import { createClientAddressResolver } from '#lib/server/api/common/utils/client-address-warning';
import type { HonoEnv } from '#lib/server/api/common/utils/hono';
import { createLazyRedisStore } from '#lib/server/api/common/utils/hono-rate-limiter-redis';
import { clientIpOptionsFromEnvs, clientIpOrFallback } from '#lib/server/api/common/utils/ip';
import { RedisService } from '#lib/server/api/databases/redis/redis.service';

const container = new Container();

function getConfigService() {
  return container.get(ConfigService);
}

function getRedisClient() {
  return container.get(RedisService).redis;
}

function getLog() {
  return container.get(LoggerService).log;
}

export function rateLimit({ limit, minutes, key = '' }: { limit: number; minutes: number; key?: string }) {
  const configService = getConfigService();

  // Kill switch for tests and controlled environments.
  if (configService.envs.DISABLE_RATE_LIMIT) {
    return async (_c: Context<HonoEnv>, next: () => Promise<void>) => {
      await next();
    };
  }

  const resolveClientAddress = createClientAddressResolver(clientIpOptionsFromEnvs(configService.envs), getLog);

  return rateLimiter({
    windowMs: minutes * 60 * 1000, // every x minutes
    limit, // Limit each key to `limit` requests per `window`.
    standardHeaders: 'draft-6', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    keyGenerator: (c: Context<HonoEnv>) => {
      // Prefer the authenticated user; otherwise a trusted client IP that a client cannot spoof.
      const clientKey = c.var.session?.userId || clientIpOrFallback(resolveClientAddress(c));
      const pathKey = key || c.req.path;
      return `${clientKey}_${pathKey}`;
    },
    // Connects Redis on the first request to this route, not while routes are built.
    store: createLazyRedisStore<HonoEnv>(getRedisClient),
  });
}
