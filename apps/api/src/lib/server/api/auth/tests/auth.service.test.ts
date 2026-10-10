import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '../../common/configs/config.service';
import { envsDto } from '../../common/configs/dtos/env.dto';
import { validEnvs } from '../../common/configs/tests/env-fixtures';
import type { DrizzleService } from '../../databases/postgres/drizzle.service';
import * as drizzleSchema from '../../databases/postgres/drizzle-schema';
import type { MailerService } from '../../mail/mailer.service';
import { AuthService } from '../auth.service';

function buildService() {
  const dbRead = vi.fn();
  const drizzleService = {
    get db() {
      dbRead();
      return drizzle.mock({ casing: 'snake_case', schema: drizzleSchema });
    },
  } as unknown as DrizzleService;
  const configService = { envs: envsDto.parse(validEnvs) } as ConfigService;
  const service = new AuthService(configService, drizzleService, { send: async () => {} } as unknown as MailerService);
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
});
