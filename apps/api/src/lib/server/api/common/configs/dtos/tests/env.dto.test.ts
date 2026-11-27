import { Environment, NodeEnv } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { DevelopmentDefault } from '#lib/server/api/common/configs/development-defaults.constant';
import { envsDto } from '#lib/server/api/common/configs/dtos/env.dto';
import { productionEnvOverrides, validEnvs } from '#lib/server/api/common/configs/tests/env-fixtures';
import { POSTGRES_SSL_MODES, PostgresSslMode } from '#lib/server/api/databases/postgres/postgres-ssl';
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
    expect(envsDto.parse(envs).DATABASE_SSL_MODE).toBe(PostgresSslMode.DISABLE);
  });

  it.each(POSTGRES_SSL_MODES)('accepts %s', (mode) => {
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

  it('refuses staging with rate limiting on and no trusted proxy', () => {
    const result = envsDto.safeParse({ ...prod, ENVIRONMENT: Environment.STAGING });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(['TRUST_PROXY']);
  });

  it('allows development without a trusted proxy (the service warns instead)', () => {
    expect(envsDto.safeParse(validEnvs).success).toBe(true);
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

  it('refuses staging without a storage webhook secret', () => {
    const result = envsDto.safeParse({ ...prod, ENVIRONMENT: Environment.STAGING });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(['STORAGE_WEBHOOK_SECRET']);
  });

  it('accepts staging with a storage webhook secret', () => {
    expect(envsDto.safeParse({ ...prod, ENVIRONMENT: Environment.STAGING, STORAGE_WEBHOOK_SECRET: 'webhook-secret' }).success).toBe(true);
  });

  it('allows development without a storage webhook secret, whatever NODE_ENV says', () => {
    const result = envsDto.safeParse({ ...validEnvs, NODE_ENV: NodeEnv.PRODUCTION, STORAGE_WEBHOOK_SECRET: '' });
    expect(result.success).toBe(true);
  });

  it('allows local development without a storage webhook secret', () => {
    const result = envsDto.safeParse({ ...validEnvs, STORAGE_WEBHOOK_SECRET: '' });
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

  it.each(['http://app.example.com', 'http://localhost:5173'])('refuses a non-https ORIGIN (%s) without printing it', (url) => {
    const result = parseProduction({ ORIGIN: url });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['ORIGIN']);
    expect(result.error?.issues[0].message).toContain('ORIGIN');
    expect(result.error?.issues[0].message).not.toContain(url);
  });

  it('refuses a non-https ORIGIN in staging too', () => {
    expect(refusedPaths({ ENVIRONMENT: Environment.STAGING, ORIGIN: 'http://app.example.com' })).toEqual(['ORIGIN']);
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

  it('accepts a staging configuration without development defaults', () => {
    expect(parseProduction({ ENVIRONMENT: Environment.STAGING }).success).toBe(true);
  });

  it('refuses every development default in staging too', () => {
    const staging = {
      ...DevelopmentDefault,
      ENVIRONMENT: Environment.STAGING,
      MAILER_TRANSPORT: MailerTransport.MAILPIT,
      BETTER_AUTH_URL: 'http://localhost:5173',
    };
    expect(refusedPaths(staging)).toEqual(
      expect.arrayContaining(['DATABASE_PASSWORD', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY', 'MAILER_TRANSPORT', 'BETTER_AUTH_URL']),
    );
  });
});

describe('envsDto production Valkey URL', () => {
  // Decision: .knowledge-base/api/decisions/index.md ("Production does not require Valkey credentials or TLS", #272).
  // Transport to internal services is the deployer's call; do not add a refusal here without revisiting that entry.
  it('accepts production with a passwordless, plain-text VALKEY_URL (see the decisions index, #272)', () => {
    const result = envsDto.safeParse({ ...validEnvs, ...productionEnvOverrides, VALKEY_URL: 'redis://valkey:6379' });
    expect(result.error?.issues).toBeUndefined();
    expect(result.success).toBe(true);
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

  it('accepts development defaults in development even when NODE_ENV is production', () => {
    expect(envsDto.safeParse({ ...validEnvs, ...DevelopmentDefault, NODE_ENV: NodeEnv.PRODUCTION }).success).toBe(true);
  });
});

describe('envsDto Environment', () => {
  const production = { ...validEnvs, ...productionEnvOverrides };
  const issuesOf = (envs: Record<string, string | undefined>) => envsDto.safeParse(envs).error?.issues ?? [];
  const pathsOf = (envs: Record<string, string | undefined>) => issuesOf(envs).map((issue) => issue.path[0]);

  it.each(Object.values(Environment))('accepts %s', (environment) => {
    const envs = environment === Environment.DEVELOPMENT ? validEnvs : { ...production, ENVIRONMENT: environment };
    expect(envsDto.parse(envs).ENVIRONMENT).toBe(environment);
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['the retired ENV value', 'dev'],
    ['unknown', 'test'],
  ])('refuses an ENVIRONMENT that is %s, with no default', (_name, value) => {
    expect(pathsOf({ ...validEnvsWithout('ENVIRONMENT'), ENVIRONMENT: value })).toEqual(['ENVIRONMENT']);
  });

  describe('retired ENV', () => {
    it.each(['dev', 'prod'])('refuses ENV=%s and points to the runbook', (value) => {
      const issues = issuesOf({ ...production, ENV: value });
      expect(issues.map((issue) => issue.path[0])).toEqual(['ENV']);
      expect(issues[0].message).toContain('environment-config');
      expect(issues[0].message).toContain('ENVIRONMENT');
    });

    it('never prints the value of ENV', () => {
      const value = 'stale-env-value';
      expect(issuesOf({ ...production, ENV: value })[0].message).not.toContain(value);
    });

    it('refuses ENV in development too', () => {
      expect(pathsOf({ ...validEnvs, ENV: 'dev' })).toEqual(['ENV']);
    });

    it('treats an empty ENV, as an env file declares it, as unset', () => {
      expect(envsDto.safeParse({ ...validEnvs, ENV: '' }).success).toBe(true);
    });

    it('leaves ENV out of the parsed envs', () => {
      expect(envsDto.parse({ ...validEnvs, ENV: '' })).not.toHaveProperty('ENV');
    });
  });

  describe('NODE_ENV in a Deployed Environment', () => {
    it.each([Environment.STAGING, Environment.PRODUCTION])('refuses %s without NODE_ENV=production', (environment) => {
      expect(pathsOf({ ...production, ENVIRONMENT: environment, NODE_ENV: NodeEnv.DEVELOPMENT })).toEqual(['NODE_ENV']);
    });

    it.each([Environment.STAGING, Environment.PRODUCTION])('refuses %s with NODE_ENV unset', (environment) => {
      const { NODE_ENV: _nodeEnv, ...withoutNodeEnv } = production;
      expect(pathsOf({ ...withoutNodeEnv, ENVIRONMENT: environment })).toEqual(['NODE_ENV']);
    });

    it.each([NodeEnv.DEVELOPMENT, NodeEnv.PRODUCTION])('accepts development with NODE_ENV=%s', (nodeEnv) => {
      expect(envsDto.safeParse({ ...validEnvs, NODE_ENV: nodeEnv }).success).toBe(true);
    });
  });
});

describe('envsDto required variables', () => {
  it.each(['DATABASE_USER', 'VALKEY_URL', 'SIGNING_SECRET', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'DOMAIN', 'STORAGE_URL', 'PUBLIC_IMAGE_URI'])(
    'rejects env missing %s',
    (key) => {
      const { [key]: _omitted, ...rest } = validEnvs as Record<string, unknown>;
      expect(() => envsDto.parse(rest)).toThrow();
    },
  );

  it('rejects a stale REDIS_URL in place of VALKEY_URL, naming VALKEY_URL', () => {
    const { VALKEY_URL, ...rest } = validEnvs;
    const result = envsDto.safeParse({ ...rest, REDIS_URL: VALKEY_URL });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['VALKEY_URL']);
  });

  it('rejects an empty SIGNING_SECRET', () => {
    expect(() => envsDto.parse({ ...validEnvs, SIGNING_SECRET: '' })).toThrow();
  });

  it('rejects a SIGNING_SECRET shorter than 32 characters', () => {
    expect(() => envsDto.parse({ ...validEnvs, SIGNING_SECRET: 'x'.repeat(31) })).toThrow(/SIGNING_SECRET must be at least 32 characters/);
  });

  it('accepts a SIGNING_SECRET of exactly 32 characters', () => {
    expect(envsDto.parse({ ...validEnvs, SIGNING_SECRET: 'x'.repeat(32) }).SIGNING_SECRET).toBe('x'.repeat(32));
  });

  it('accepts the 64-character output of openssl rand -hex 32', () => {
    const hex = '18b95fc1f00bd060e8d797afb61390d52310db937ae6308a96cb382c8c2a14f4';
    expect(envsDto.safeParse({ ...validEnvs, SIGNING_SECRET: hex }).success).toBe(true);
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

  it.each([Environment.DEVELOPMENT, Environment.STAGING, Environment.PRODUCTION])('rejects a non-url ORIGIN in %s', (environment) => {
    const base = environment === Environment.DEVELOPMENT ? validEnvs : { ...validEnvs, ...productionEnvOverrides };
    const result = envsDto.safeParse({ ...base, ENVIRONMENT: environment, ORIGIN: 'not-a-url' });
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain('ORIGIN');
  });

  it('accepts an http ORIGIN in development', () => {
    expect(envsDto.parse({ ...validEnvs, ORIGIN: 'http://localhost:5173' }).ORIGIN).toBe('http://localhost:5173');
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
