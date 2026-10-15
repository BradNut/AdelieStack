import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '#lib/server/api/auth/auth.service';
import type { ConfigService } from '#lib/server/api/common/configs/config.service';
import { envsDto } from '#lib/server/api/common/configs/dtos/env.dto';
import { validEnvs } from '#lib/server/api/common/configs/tests/env-fixtures';
import type { LoggerService } from '#lib/server/api/common/services/logger.service';
import type { DrizzleService } from '#lib/server/api/databases/postgres/drizzle.service';
import * as drizzleSchema from '#lib/server/api/databases/postgres/drizzle-schema';
import type { RedisService } from '#lib/server/api/databases/redis/redis.service';
import type { MailerService } from '#lib/server/api/mail/mailer.service';

function buildService(envs: Record<string, string> = {}) {
  const dbRead = vi.fn();
  const drizzleService = {
    get db() {
      dbRead();
      return drizzle.mock({ casing: 'snake_case', schema: drizzleSchema });
    },
  } as unknown as DrizzleService;
  const configService = { envs: envsDto.parse({ ...validEnvs, ...envs }) } as ConfigService;
  const redisEval = vi.fn(async () => [1, 60]);
  const redisRead = vi.fn();
  const redisService = {
    get redis() {
      redisRead();
      return { eval: redisEval };
    },
  } as unknown as RedisService;
  const service = new AuthService(
    configService,
    drizzleService,
    { send: async () => {} } as unknown as MailerService,
    { log: { error: vi.fn() } } as unknown as LoggerService,
    redisService,
  );
  return { service, dbRead, redisEval, redisRead };
}

describe('AuthService', () => {
  describe('auth rate limiting', () => {
    const request = (service: AuthService) =>
      service.auth.handler(new Request('http://localhost:3000/api/auth/ok', { headers: { 'x-forwarded-for': '203.0.113.7' } }));

    it('counts auth requests in Redis', async () => {
      const { service, redisEval } = buildService();

      await request(service);

      expect(redisEval).toHaveBeenCalledOnce();
    });

    it('opens no Redis connection until an auth request arrives', () => {
      const { service, redisRead } = buildService();

      expect(service.auth).toBeDefined();
      expect(redisRead).not.toHaveBeenCalled();
    });

    it('neither counts nor touches Redis when DISABLE_RATE_LIMIT is on', async () => {
      const { service, redisEval, redisRead } = buildService({ DISABLE_RATE_LIMIT: 'true' });

      await request(service);

      expect(redisEval).not.toHaveBeenCalled();
      expect(redisRead).not.toHaveBeenCalled();
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
