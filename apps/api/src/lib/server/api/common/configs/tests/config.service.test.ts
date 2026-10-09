import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setProcessEnvs, validEnvs } from './env-fixtures';

/** The DTO coerces these string inputs to their typed values. */
const parsedEnvs = {
  ...validEnvs,
  DATABASE_PORT: 5432,
  PORT: 3001,
  STORAGE_PORT: 8333,
  DB_MIGRATING: false,
  DB_SEEDING: false,
  STORAGE_SSL: false,
  TRUST_PROXY: false,
  DISABLE_RATE_LIMIT: false,
  OTEL_ENABLED: false,
};

describe('ConfigService', () => {
  beforeEach(() => {
    vi.resetModules();
    setProcessEnvs(validEnvs);
  });

  afterEach(() => {
    setProcessEnvs(validEnvs);
  });

  async function createConfigService() {
    const { ConfigService } = await import('../config.service');
    return new ConfigService();
  }

  it('constructs with the complete valid env set', async () => {
    const service = await createConfigService();
    expect(service.envs).toMatchObject(parsedEnvs);
  });

  it('validateEnvs returns the parsed env set', async () => {
    const service = await createConfigService();
    expect(service.validateEnvs()).toMatchObject(parsedEnvs);
  });

  it('throws a wrapped error when a required env is missing', async () => {
    setProcessEnvs({ ...validEnvs, SIGNING_SECRET: undefined });
    const { ConfigService } = await import('../config.service');
    expect(() => new ConfigService()).toThrowError(/Missing environment variables:/);
  });

  it('throws a wrapped error when ports are not numbers', async () => {
    setProcessEnvs({ ...validEnvs, DATABASE_PORT: 'nope', PORT: 'nope', STORAGE_PORT: 'nope' });
    const { ConfigService } = await import('../config.service');
    expect(() => new ConfigService()).toThrowError(/Missing environment variables:/);
  });
});
