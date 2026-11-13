import { AppEnv, DeployEnvironment, NodeEnv } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { DevelopmentDefault } from '#lib/server/api/common/configs/development-defaults.constant';
import { envsDto } from '#lib/server/api/common/configs/dtos/env.dto';
import { productionEnvOverrides, validEnvs } from '#lib/server/api/common/configs/tests/env-fixtures';
import { MailerTransport } from '#lib/server/api/mail/mailer-transport.constant';

/** {@link validEnvs} without `names`, so a test sees each one fall back to its default. */
const validEnvsWithout = (...names: string[]) => Object.fromEntries(Object.entries(validEnvs).filter(([name]) => !names.includes(name)));

describe('envsDto observability vars', () => {
  it('defaults OTel off and keeps Sentry optional', () => {
    const env = envsDto.parse(validEnvsWithout('OTEL_ENABLED', 'OTEL_EXPORTER_OTLP_ENDPOINT'));
    expect(env.OTEL_ENABLED).toBe(false);
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://localhost:4318/v1/traces');
    expect(env.SENTRY_BACKEND_URL).toBeUndefined();
  });

  it('coerces OTEL_ENABLED and accepts the Sentry/OTLP urls', () => {
    const env = envsDto.parse({
      ...validEnvs,
      OTEL_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://jaeger:4318/v1/traces',
      SENTRY_BACKEND_URL: 'https://sentry.example.com/1',
    });
    expect(env.OTEL_ENABLED).toBe(true);
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://jaeger:4318/v1/traces');
    expect(env.SENTRY_BACKEND_URL).toBe('https://sentry.example.com/1');
  });

  it('allows an empty Sentry url', () => {
    expect(envsDto.parse({ ...validEnvs, SENTRY_BACKEND_URL: '' }).SENTRY_BACKEND_URL).toBe('');
  });

  it('rejects a non-url OTLP endpoint', () => {
    expect(() => envsDto.parse({ ...validEnvs, OTEL_EXPORTER_OTLP_ENDPOINT: 'not-a-url' })).toThrow();
  });

  it('rejects a non-url Sentry endpoint', () => {
    expect(() => envsDto.parse({ ...validEnvs, SENTRY_BACKEND_URL: 'not-a-url' })).toThrow();
  });
});

describe('envsDto security switches', () => {
  it('defaults the rate-limit switches off', () => {
    const env = envsDto.parse(validEnvsWithout('TRUST_PROXY', 'DISABLE_RATE_LIMIT'));
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.DISABLE_RATE_LIMIT).toBe(false);
  });

  it('coerces the rate-limit switches from strings', () => {
    const env = envsDto.parse({ ...validEnvs, TRUST_PROXY: 'true', DISABLE_RATE_LIMIT: 'true' });
    expect(env.TRUST_PROXY).toBe(true);
    expect(env.DISABLE_RATE_LIMIT).toBe(true);
  });
});

describe('envsDto database TLS mode', () => {
  it.each([
    { name: 'unset', envs: validEnvsWithout('DATABASE_SSL_MODE') },
    { name: 'empty', envs: { ...validEnvs, DATABASE_SSL_MODE: '' } },
  ])('defaults to disable when $name, so local development needs no setting', ({ envs }) => {
    expect(envsDto.parse(envs).DATABASE_SSL_MODE).toBe('disable');
  });

  it.each(['disable', 'verify-full', 'require'])('accepts %s', (mode) => {
    expect(envsDto.parse({ ...validEnvs, DATABASE_SSL_MODE: mode }).DATABASE_SSL_MODE).toBe(mode);
  });

  it.each(['true', 'prefer', 'VERIFY-FULL'])('refuses the unknown mode %s', (mode) => {
    const result = envsDto.safeParse({ ...validEnvs, DATABASE_SSL_MODE: mode });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('DATABASE_SSL_MODE');
  });
});

describe('envsDto trusted proxies', () => {
  const parse = (TRUSTED_PROXIES: string) => envsDto.safeParse({ ...validEnvs, TRUSTED_PROXIES });

  it('declares none by default', () => {
    expect(envsDto.parse({ ...validEnvs }).TRUSTED_PROXIES).toEqual([]);
  });

  it('treats an empty value as none', () => {
    expect(parse('').data?.TRUSTED_PROXIES).toEqual([]);
  });

  it('accepts IPs and CIDR ranges of both families, ignoring spaces and stray commas', () => {
    expect(parse(' 10.0.0.0/8, 192.0.2.10,,2001:db8::/32,2001:db8::1,').data?.TRUSTED_PROXIES).toEqual([
      '10.0.0.0/8',
      '192.0.2.10',
      '2001:db8::/32',
      '2001:db8::1',
    ]);
  });

  it.each(['nope', '10.0.0.0/33', '10.0.0.1/', '10.0.0.1/a', '10.0.0.1/-1', '2001:db8::/129', '/8', '10.0.0.0/8,nope'])('refuses %j', (value) => {
    const result = parse(value);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain('TRUSTED_PROXIES');
  });

  it('names only the invalid entries', () => {
    const message = parse('10.0.0.0/8,nope').error?.issues[0].message;

    expect(message).toContain('nope');
    expect(message).not.toContain('10.0.0.0/8');
  });
});

describe('envsDto auth rate-limit bucket', () => {
  const prod = { ...validEnvs, ...productionEnvOverrides, TRUST_PROXY: 'false' };

  it('refuses production with rate limiting on and no trusted proxy', () => {
    const result = envsDto.safeParse(prod);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain('TRUST_PROXY');
  });

  it('accepts production behind a trusted proxy', () => {
    expect(envsDto.safeParse({ ...prod, TRUST_PROXY: 'true' }).success).toBe(true);
  });

  it('accepts production with rate limiting turned off explicitly', () => {
    expect(envsDto.safeParse({ ...prod, DISABLE_RATE_LIMIT: 'true' }).success).toBe(true);
  });

  it('allows development without a trusted proxy (the service warns instead)', () => {
    expect(envsDto.safeParse({ ...validEnvs, ENV: 'dev' }).success).toBe(true);
  });
});

describe('envsDto storage webhook secret', () => {
  const { STORAGE_WEBHOOK_SECRET: _secret, ...prod } = { ...validEnvs, ...productionEnvOverrides };

  it('refuses production without a storage webhook secret', () => {
    const result = envsDto.safeParse(prod);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain('STORAGE_WEBHOOK_SECRET');
  });

  it('treats an empty storage webhook secret as missing in production', () => {
    const result = envsDto.safeParse({ ...prod, STORAGE_WEBHOOK_SECRET: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain('STORAGE_WEBHOOK_SECRET');
  });

  it('accepts production with a storage webhook secret', () => {
    expect(envsDto.safeParse({ ...prod, STORAGE_WEBHOOK_SECRET: 'webhook-secret' }).success).toBe(true);
  });

  it('treats a whitespace-only storage webhook secret as missing in production', () => {
    const result = envsDto.safeParse({ ...prod, STORAGE_WEBHOOK_SECRET: '   ' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain('STORAGE_WEBHOOK_SECRET');
  });

  it.each([
    ['ENVIRONMENT', 'production'],
    ['ENVIRONMENT', 'staging'],
    ['NODE_ENV', 'production'],
  ])('refuses ENV=dev with %s=%s without a storage webhook secret', (name, value) => {
    const result = envsDto.safeParse({ ...validEnvs, ENV: 'dev', [name]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain('STORAGE_WEBHOOK_SECRET');
  });

  it('accepts a staging deploy on ENV=dev with a storage webhook secret', () => {
    const deployed = { ...validEnvs, ENV: 'dev', ENVIRONMENT: 'staging', STORAGE_WEBHOOK_SECRET: 'webhook-secret' };
    expect(envsDto.safeParse(deployed).success).toBe(true);
  });

  it('allows local development without a storage webhook secret', () => {
    const result = envsDto.safeParse({ ...validEnvs, ENV: 'dev', STORAGE_WEBHOOK_SECRET: '' });
    expect(result.success).toBe(true);
    expect(result.data?.STORAGE_WEBHOOK_SECRET).toBeUndefined();
  });
});

describe('envsDto production refuses development defaults', () => {
  const production = { ...validEnvs, ...productionEnvOverrides };
  const parseProduction = (overrides: Record<string, string>) => envsDto.safeParse({ ...production, ...overrides });
  const refusedPaths = (overrides: Record<string, string>) => parseProduction(overrides).error?.issues.map((issue) => issue.path[0]);

  it('accepts a production configuration without development defaults', () => {
    expect(envsDto.safeParse(production).success).toBe(true);
  });

  const developmentDefaults = Object.entries(DevelopmentDefault);

  it.each(developmentDefaults)('refuses the development default of %s and names it', (name, value) => {
    expect(refusedPaths({ [name]: value })).toEqual([name]);
  });

  it.each(developmentDefaults)('never prints the development default of %s', (name, value) => {
    const messages = parseProduction({ [name]: value }).error?.issues.map((issue) => issue.message) ?? [];
    expect(messages.join('\n')).toContain(name);
    expect(messages.join('\n')).not.toContain(value);
  });

  it('refuses the mailpit transport and names it', () => {
    expect(refusedPaths({ MAILER_TRANSPORT: MailerTransport.MAILPIT })).toEqual(['MAILER_TRANSPORT']);
  });

  it('refuses the mailpit transport when MAILER_TRANSPORT is left at its default', () => {
    const { MAILER_TRANSPORT: _transport, ...withoutTransport } = production;
    expect(envsDto.safeParse(withoutTransport).error?.issues.map((issue) => issue.path[0])).toEqual(['MAILER_TRANSPORT']);
  });

  it.each(['http://app.example.com', 'http://localhost:5173'])('refuses a non-https BETTER_AUTH_URL (%s) without printing it', (url) => {
    const result = parseProduction({ BETTER_AUTH_URL: url });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['BETTER_AUTH_URL']);
    expect(result.error?.issues[0].message).not.toContain(url);
  });

  it('names every development default at once', () => {
    expect(
      refusedPaths({
        ...DevelopmentDefault,
        MAILER_TRANSPORT: MailerTransport.MAILPIT,
        BETTER_AUTH_URL: 'http://localhost:5173',
      }),
    ).toEqual(expect.arrayContaining(['DATABASE_PASSWORD', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY', 'MAILER_TRANSPORT', 'BETTER_AUTH_URL']));
  });

  it.each([
    ['NODE_ENV', NodeEnv.PRODUCTION],
    ['ENVIRONMENT', DeployEnvironment.PRODUCTION],
  ])('refuses %s=%s with ENV=dev and names ENV', (name, value) => {
    const result = envsDto.safeParse({
      ...production,
      ENV: AppEnv.DEV,
      ENVIRONMENT: DeployEnvironment.STAGING,
      NODE_ENV: NodeEnv.DEVELOPMENT,
      [name]: value,
    });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['ENV']);
  });

  it('refuses development defaults when only NODE_ENV declares production', () => {
    const deployed = { ...validEnvs, ...DevelopmentDefault, NODE_ENV: NodeEnv.PRODUCTION, STORAGE_WEBHOOK_SECRET: 'webhook-secret' };
    expect(envsDto.safeParse(deployed).error?.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(['ENV', 'DATABASE_PASSWORD', 'MAILER_TRANSPORT', 'BETTER_AUTH_URL']),
    );
  });

  it('accepts a production ENV with a staging ENVIRONMENT', () => {
    expect(parseProduction({ ENVIRONMENT: DeployEnvironment.STAGING }).success).toBe(true);
  });
});

describe('envsDto development and test configurations', () => {
  it('accepts every development default, mailpit and an http BETTER_AUTH_URL', () => {
    const local = {
      ...validEnvs,
      ...DevelopmentDefault,
      MAILER_TRANSPORT: MailerTransport.MAILPIT,
      BETTER_AUTH_URL: 'http://localhost:5173',
    };
    expect(envsDto.safeParse(local).success).toBe(true);
  });

  it('accepts a staging deploy on ENV=dev with development defaults', () => {
    const staging = {
      ...validEnvs,
      ...DevelopmentDefault,
      ENV: AppEnv.DEV,
      ENVIRONMENT: DeployEnvironment.STAGING,
      STORAGE_WEBHOOK_SECRET: 'webhook-secret',
    };
    expect(envsDto.safeParse(staging).success).toBe(true);
  });
});

describe('envsDto required variables', () => {
  it.each(['DATABASE_USER', 'REDIS_URL', 'SIGNING_SECRET', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'DOMAIN', 'STORAGE_URL', 'PUBLIC_IMAGE_URI'])(
    'rejects env missing %s',
    (key) => {
      const { [key]: _omitted, ...rest } = validEnvs as Record<string, unknown>;
      expect(() => envsDto.parse(rest)).toThrow();
    },
  );

  it('rejects an empty SIGNING_SECRET', () => {
    expect(() => envsDto.parse({ ...validEnvs, SIGNING_SECRET: '' })).toThrow();
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => envsDto.parse({ ...validEnvs, PORT: 'not-a-number' })).toThrow();
  });
});

describe('envsDto Better Auth variables', () => {
  it('accepts a 32+ character secret and a url', () => {
    const env = envsDto.parse({ ...validEnvs });
    expect(env.BETTER_AUTH_SECRET).toBe(validEnvs.BETTER_AUTH_SECRET);
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:5173');
  });

  it('rejects a BETTER_AUTH_SECRET shorter than 32 characters', () => {
    expect(() => envsDto.parse({ ...validEnvs, BETTER_AUTH_SECRET: 'x'.repeat(31) })).toThrow();
  });

  it('rejects an empty BETTER_AUTH_SECRET', () => {
    expect(() => envsDto.parse({ ...validEnvs, BETTER_AUTH_SECRET: '' })).toThrow();
  });

  it('rejects a non-url BETTER_AUTH_URL', () => {
    expect(() => envsDto.parse({ ...validEnvs, BETTER_AUTH_URL: 'not-a-url' })).toThrow();
  });
});

describe('envsDto two-factor issuer', () => {
  it('defaults TWO_FACTOR_ISSUER to AdelieStack', () => {
    expect(envsDto.parse({ ...validEnvs }).TWO_FACTOR_ISSUER).toBe('AdelieStack');
  });

  it('accepts a custom issuer', () => {
    expect(envsDto.parse({ ...validEnvs, TWO_FACTOR_ISSUER: 'Acme' }).TWO_FACTOR_ISSUER).toBe('Acme');
  });

  it('rejects an empty issuer', () => {
    expect(() => envsDto.parse({ ...validEnvs, TWO_FACTOR_ISSUER: '' })).toThrow();
  });
});

describe('envsDto passkey relying party', () => {
  it('defaults to localhost and AdelieStack', () => {
    const env = envsDto.parse({ ...validEnvs });
    expect(env.PASSKEY_RP_ID).toBe('localhost');
    expect(env.PASSKEY_RP_NAME).toBe('AdelieStack');
  });

  it('accepts custom values', () => {
    const env = envsDto.parse({ ...validEnvs, PASSKEY_RP_ID: 'example.com', PASSKEY_RP_NAME: 'Acme' });
    expect(env.PASSKEY_RP_ID).toBe('example.com');
    expect(env.PASSKEY_RP_NAME).toBe('Acme');
  });

  it('rejects empty values', () => {
    expect(() => envsDto.parse({ ...validEnvs, PASSKEY_RP_ID: '' })).toThrow();
    expect(() => envsDto.parse({ ...validEnvs, PASSKEY_RP_NAME: '' })).toThrow();
  });
});

describe('envsDto seed admin', () => {
  it('keeps ADMIN_EMAIL optional', () => {
    expect(envsDto.parse({ ...validEnvs }).ADMIN_EMAIL).toBeUndefined();
  });

  it('accepts a valid ADMIN_EMAIL', () => {
    expect(envsDto.parse({ ...validEnvs, ADMIN_EMAIL: 'admin@example.com' }).ADMIN_EMAIL).toBe('admin@example.com');
  });

  it('rejects an ADMIN_EMAIL that is not an email', () => {
    expect(() => envsDto.parse({ ...validEnvs, ADMIN_EMAIL: 'admin' })).toThrow();
  });
});

describe('envsDto sign-up flag', () => {
  it('defaults SIGN_UP_ENABLED to closed', () => {
    expect(envsDto.parse({ ...validEnvs }).SIGN_UP_ENABLED).toBe(false);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('parses SIGN_UP_ENABLED=%s', (value, expected) => {
    expect(envsDto.parse({ ...validEnvs, SIGN_UP_ENABLED: value }).SIGN_UP_ENABLED).toBe(expected);
  });

  it('rejects a value that is not a boolean string', () => {
    expect(() => envsDto.parse({ ...validEnvs, SIGN_UP_ENABLED: 'maybe' })).toThrow();
  });
});

describe('envsDto useSend variables', () => {
  const unsend = { ...validEnvs, MAILER_TRANSPORT: 'unsend', USESEND_API_KEY: 'us_test_key', MAIL_FROM: 'noreply@example.com' };

  it('accepts unsend with every variable present, keeping the values', () => {
    const env = envsDto.parse({ ...unsend, USESEND_BASE_URL: 'https://mail.example.com' });
    expect(env.USESEND_API_KEY).toBe('us_test_key');
    expect(env.MAIL_FROM).toBe('noreply@example.com');
    expect(env.USESEND_BASE_URL).toBe('https://mail.example.com');
  });

  it('accepts unsend without USESEND_BASE_URL, also when it is declared empty', () => {
    expect(envsDto.parse(unsend).USESEND_BASE_URL).toBeUndefined();
    expect(envsDto.parse({ ...unsend, USESEND_BASE_URL: '' }).USESEND_BASE_URL).toBeUndefined();
  });

  it.each(['USESEND_API_KEY', 'MAIL_FROM'] as const)('refuses unsend without %s and names it', (name) => {
    const { [name]: _omitted, ...rest } = unsend;
    const result = envsDto.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([expect.objectContaining({ path: [name], message: `${name} is required when MAILER_TRANSPORT is unsend` })]);
  });

  it.each(['USESEND_API_KEY', 'MAIL_FROM'] as const)('treats an empty %s as missing', (name) => {
    const result = envsDto.safeParse({ ...unsend, [name]: '' });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([name]);
  });

  it('names both variables when both are missing', () => {
    const result = envsDto.safeParse({ ...validEnvs, MAILER_TRANSPORT: 'unsend' });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['USESEND_API_KEY', 'MAIL_FROM']);
  });

  it('requires none of them with mailpit, the default transport', () => {
    const env = envsDto.parse({ ...validEnvs });
    expect(env.MAILER_TRANSPORT).toBe('mailpit');
    expect(env.USESEND_API_KEY).toBeUndefined();
    expect(env.MAIL_FROM).toBeUndefined();
    expect(env.USESEND_BASE_URL).toBeUndefined();
  });

  it('checks the captcha variables alongside the useSend ones', () => {
    const result = envsDto.safeParse({ ...validEnvs, MAILER_TRANSPORT: 'unsend', CAPTCHA_ENABLED: 'true' });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      'USESEND_API_KEY',
      'MAIL_FROM',
      'CAPTCHA_PROVIDER',
      'CAPTCHA_SECRET_KEY',
      'CAPTCHA_SITE_KEY',
    ]);
  });
});
