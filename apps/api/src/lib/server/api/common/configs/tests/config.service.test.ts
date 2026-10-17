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
  ALLOW_MULTIPLE_ROLES: false,
  HIBP_ENABLED: true,
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
    const { ConfigService } = await import('#lib/server/api/common/configs/config.service');
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

  it('enables multiple roles only when ALLOW_MULTIPLE_ROLES is true', async () => {
    setProcessEnvs({ ...validEnvs, ALLOW_MULTIPLE_ROLES: 'true' });
    expect((await createConfigService()).envs.ALLOW_MULTIPLE_ROLES).toBe(true);
  });

  it('throws a wrapped error when a required env is missing', async () => {
    setProcessEnvs({ ...validEnvs, SIGNING_SECRET: undefined });
    const { ConfigService } = await import('#lib/server/api/common/configs/config.service');
    expect(() => new ConfigService()).toThrowError(/Missing environment variables:/);
  });

  it('throws a wrapped error when ports are not numbers', async () => {
    setProcessEnvs({ ...validEnvs, DATABASE_PORT: 'nope', PORT: 'nope', STORAGE_PORT: 'nope' });
    const { ConfigService } = await import('#lib/server/api/common/configs/config.service');
    expect(() => new ConfigService()).toThrowError(/Missing environment variables:/);
  });

  it('turns HIBP screening off only when HIBP_ENABLED is false', async () => {
    setProcessEnvs({ ...validEnvs, HIBP_ENABLED: 'false' });
    const service = await createConfigService();
    expect(service.envs.HIBP_ENABLED).toBe(false);
  });

  it('rejects a HIBP_ENABLED value that is not a boolean string', async () => {
    setProcessEnvs({ ...validEnvs, HIBP_ENABLED: 'maybe' });
    const { ConfigService } = await import('#lib/server/api/common/configs/config.service');
    expect(() => new ConfigService()).toThrowError(/HIBP_ENABLED/);
  });
});

describe('ConfigService captcha settings', () => {
  const enabled = { CAPTCHA_ENABLED: 'true', CAPTCHA_PROVIDER: 'hcaptcha', CAPTCHA_SECRET_KEY: 'secret', CAPTCHA_SITE_KEY: 'site' };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    setProcessEnvs(validEnvs);
  });

  async function create(envs: Record<string, string | undefined>) {
    setProcessEnvs({ ...validEnvs, ...envs });
    const { ConfigService } = await import('#lib/server/api/common/configs/config.service');
    return new ConfigService();
  }

  it('is off by default and needs no captcha variables', async () => {
    expect((await create({})).envs.CAPTCHA_ENABLED).toBe(false);
  });

  it('accepts a complete enabled configuration', async () => {
    const { envs } = await create(enabled);
    expect(envs).toMatchObject({ CAPTCHA_ENABLED: true, CAPTCHA_PROVIDER: 'hcaptcha', CAPTCHA_SECRET_KEY: 'secret', CAPTCHA_SITE_KEY: 'site' });
  });

  it.each(['CAPTCHA_PROVIDER', 'CAPTCHA_SECRET_KEY', 'CAPTCHA_SITE_KEY'])('names %s when captcha is enabled without it', async (name) => {
    await expect(create({ ...enabled, [name]: undefined })).rejects.toThrowError(new RegExp(name));
  });

  it('treats empty optional captcha variables as unset', async () => {
    const { envs } = await create({ CAPTCHA_PROVIDER: '', CAPTCHA_SECRET_KEY: '', CAPTCHA_SITE_KEY: '', CAPTCHA_MIN_SCORE: '' });
    expect(envs.CAPTCHA_PROVIDER).toBeUndefined();
    await expect(create({ ...enabled, CAPTCHA_SECRET_KEY: '' })).rejects.toThrowError(/CAPTCHA_SECRET_KEY/);
  });

  it('rejects an unknown provider', async () => {
    await expect(create({ ...enabled, CAPTCHA_PROVIDER: 'nopecha' })).rejects.toThrowError(/CAPTCHA_PROVIDER/);
  });

  it('accepts an optional minimum score and rejects one outside 0..1', async () => {
    expect((await create({ ...enabled, CAPTCHA_PROVIDER: 'google-recaptcha', CAPTCHA_MIN_SCORE: '0.7' })).envs.CAPTCHA_MIN_SCORE).toBe(0.7);
    await expect(create({ ...enabled, CAPTCHA_MIN_SCORE: '2' })).rejects.toThrowError(/CAPTCHA_MIN_SCORE/);
  });
});

describe('ConfigService social login settings', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    setProcessEnvs(validEnvs);
  });

  async function create(envs: Record<string, string | undefined>) {
    setProcessEnvs({ ...validEnvs, ...envs });
    const { ConfigService } = await import('#lib/server/api/common/configs/config.service');
    return new ConfigService();
  }

  it('needs no provider credentials', async () => {
    const { envs } = await create({});
    expect(envs.GITHUB_CLIENT_ID).toBeUndefined();
    expect(envs.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it('accepts a complete credential pair', async () => {
    const { envs } = await create({ GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' });
    expect(envs).toMatchObject({ GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' });
  });

  it.each([
    ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  ])('names the missing half when only %s is set', async (idName, secretName) => {
    await expect(create({ [idName]: 'id' })).rejects.toThrowError(new RegExp(secretName));
  });

  it('treats empty credential variables as unset', async () => {
    const { envs } = await create({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });
    expect(envs.GOOGLE_CLIENT_ID).toBeUndefined();
  });
});
