import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '../../common/configs/config.service';
import { envsDto } from '../../common/configs/dtos/env.dto';
import { validEnvs } from '../../common/configs/tests/env-fixtures';
import type { LoggerService } from '../../common/services/logger.service';
import type { DrizzleService } from '../../databases/postgres/drizzle.service';
import * as drizzleSchema from '../../databases/postgres/drizzle-schema';
import type { MailerService } from '../../mail/mailer.service';
import { AuthService } from '../auth.service';

function buildService(envs: Record<string, string> = {}) {
  const dbRead = vi.fn();
  const drizzleService = {
    get db() {
      dbRead();
      return drizzle.mock({ casing: 'snake_case', schema: drizzleSchema });
    },
  } as unknown as DrizzleService;
  const configService = { envs: envsDto.parse({ ...validEnvs, ...envs }) } as ConfigService;
  const service = new AuthService(
    configService,
    drizzleService,
    { send: async () => {} } as unknown as MailerService,
    { log: { error: vi.fn() } } as unknown as LoggerService,
  );
  return { service, dbRead };
}

describe('AuthService', () => {
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
