import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import { AuthRateLimitRepository } from '#lib/server/api/auth/auth.rate-limit.repository';
import { AuthService } from '#lib/server/api/auth/auth.service';
import type { ConfigService } from '#lib/server/api/common/configs/config.service';
import { envsDto } from '#lib/server/api/common/configs/dtos/env.dto';
import { validEnvs } from '#lib/server/api/common/configs/tests/env-fixtures';
import type { LoggerService } from '#lib/server/api/common/services/logger.service';
import type { DrizzleService } from '#lib/server/api/databases/postgres/drizzle.service';
import * as drizzleSchema from '#lib/server/api/databases/postgres/drizzle-schema';
import type { RedisService } from '#lib/server/api/databases/redis/redis.service';
import type { MailerService } from '#lib/server/api/mail/mailer.service';
import { createRedisServiceMock } from '../../../../../test/mocks/redis.mock';

function buildService(envs: Record<string, string> = {}) {
  const dbRead = vi.fn();
  const drizzleService = {
    get db() {
      dbRead();
      return drizzle.mock({ casing: 'snake_case', schema: drizzleSchema });
    },
  } as unknown as DrizzleService;
  const configService = { envs: envsDto.parse({ ...validEnvs, ...envs }) } as ConfigService;
  const redis = createRedisServiceMock();
  const service = new AuthService(
    configService,
    drizzleService,
    { send: async () => {} } as unknown as MailerService,
    { log: { error: vi.fn() } } as unknown as LoggerService,
    new AuthRateLimitRepository(redis as unknown as RedisService),
  );
  return { service, dbRead, redis };
}

describe('AuthService', () => {
  describe('auth API reference', () => {
    const reference = (service: AuthService) => service.auth.handler(new Request('http://localhost:3000/api/auth/reference'));

    it('serves the reference outside production', async () => {
      const { service } = buildService({ ENV: 'dev' });

      expect((await reference(service)).status).toBe(200);
    });

    it('has no reference route in production', async () => {
      const { service } = buildService({ ENV: 'prod' });

      expect((await reference(service)).status).toBe(404);
    });
  });

  describe('auth rate limiting', () => {
    const request = (service: AuthService) =>
      service.auth.handler(new Request('http://localhost:3000/api/auth/ok', { headers: { 'x-forwarded-for': '203.0.113.7' } }));

    it('counts auth requests in Redis', async () => {
      const { service, redis } = buildService();

      await request(service);

      expect(redis.incrementWithExpiry).toHaveBeenCalledOnce();
    });

    it('does not count anything before an auth request arrives', () => {
      const { service, redis } = buildService();

      expect(service.auth).toBeDefined();
      expect(redis.incrementWithExpiry).not.toHaveBeenCalled();
    });

    it('does not count or touch Redis when DISABLE_RATE_LIMIT is on', async () => {
      const { service, redis } = buildService({ DISABLE_RATE_LIMIT: 'true' });

      await request(service);

      expect(redis.incrementWithExpiry).not.toHaveBeenCalled();
    });
  });

  it('creates the Better Auth instance on first use, not on construction', () => {
    const { service, dbRead } = buildService();

    expect(dbRead).not.toHaveBeenCalled();
    expect(service.auth).toBeDefined();
    expect(dbRead).toHaveBeenCalledOnce();
  });

  it('reuses the one instance afterwards', () => {
    const { service, dbRead } = buildService();

    expect(service.auth).toBe(service.auth);
    expect(dbRead).toHaveBeenCalledOnce();
  });

  it('reports captcha disabled, with no provider details, by default', () => {
    const { service } = buildService();

    expect(service.captchaPublicConfig).toEqual({ enabled: false });
    expect(service.captchaStatus.health).toBe('disabled');
  });

  it('exposes only enabled, provider and site key when captcha is on', () => {
    const { service } = buildService({ CAPTCHA_ENABLED: 'true', CAPTCHA_PROVIDER: 'hcaptcha', CAPTCHA_SECRET_KEY: 'shh', CAPTCHA_SITE_KEY: 'site' });

    expect(service.captchaPublicConfig).toEqual({ enabled: true, provider: 'hcaptcha', siteKey: 'site' });
    expect(service.captchaStatus.health).toBe('unknown');
  });
});
