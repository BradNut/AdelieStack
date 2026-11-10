import { AUTH_CLIENT_IP_HEADER, RoleName } from '@adelie/shared';
import { Hono } from 'hono';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminExampleController } from '#lib/server/api/admin/admin-example.controller';
import { ApplicationController } from '#lib/server/api/application.controller';
import { ProviderHealthState, type ProviderHealthStateName } from '#lib/server/api/auth/auth.provider-health';
import type { AuthService } from '#lib/server/api/auth/auth.service';
import { RolesService } from '#lib/server/api/auth/roles';
import type { ConfigService } from '#lib/server/api/common/configs/config.service';
import { validEnvs } from '#lib/server/api/common/configs/tests/env-fixtures';
import type { LoggerService } from '#lib/server/api/common/services/logger.service';
import { buildAuthSession, buildAuthUser } from '#lib/server/api/common/testing/factories';
import { MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS } from '#lib/server/api/common/utils/client-address-warning';
import { ConfigController } from '#lib/server/api/config/config.controller';
import type { StorageWebhookController } from '#lib/server/api/storage/storage-webhook.controller';
import { UsersController } from '#lib/server/api/users/users.controller';

const handler = vi.fn();
const getSession = vi.fn();
const hibpStatus: { health: ProviderHealthStateName } = { health: ProviderHealthState.UNKNOWN };
const captchaStatus: { health: ProviderHealthStateName } = { health: ProviderHealthState.DISABLED };
const captchaPublicConfig = { enabled: false } as { enabled: boolean; provider?: string; siteKey?: string };
const rolesService = new RolesService(
  { envs: { ALLOW_MULTIPLE_ROLES: false } } as ConfigService,
  { log: { warn: vi.fn() } } as unknown as LoggerService,
);
const authService = {
  enabledSocialProviders: [],
  auth: { handler, api: { getSession } },
  hibpStatus,
  captchaStatus,
  captchaPublicConfig,
} as unknown as AuthService;

function buildApp(envs: Record<string, unknown> = {}, log = pino({ enabled: false })) {
  return new ApplicationController(
    authService,
    new UsersController(rolesService),
    {
      routes: () => new Hono(),
    } as unknown as StorageWebhookController,
    new ConfigController({ envs: { SIGN_UP_ENABLED: true } } as unknown as ConfigService, authService),
    new AdminExampleController(authService, rolesService),
    { envs: { SIGNING_SECRET: 'test-signing-secret', ENV: 'test', ...envs } } as unknown as ConfigService,
    { log } as unknown as LoggerService,
  ).registerControllers();
}

beforeEach(() => {
  for (const [key, value] of Object.entries(validEnvs)) vi.stubEnv(key, value);
  handler.mockReset().mockImplementation(async () => new Response('from-better-auth'));
  getSession.mockReset().mockResolvedValue(null);
  hibpStatus.health = ProviderHealthState.UNKNOWN;
  captchaStatus.health = ProviderHealthState.DISABLED;
});

describe('auth handler mount', () => {
  it('routes /api/auth/* to Better Auth before the session middleware runs', async () => {
    const res = await buildApp().request('/api/auth/sign-in/email', { method: 'POST' });

    expect(await res.text()).toBe('from-better-auth');
    expect(handler).toHaveBeenCalledOnce();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('still resolves the session for other routes', async () => {
    await buildApp().request('/api/users/me');

    expect(getSession).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('missing client address warning', () => {
  const logged: string[] = [];
  const log = pino({ level: 'warn' }, { write: (line: string) => void logged.push(line) });
  const trusting = { TRUST_PROXY: true, TRUSTED_PROXIES: [], DISABLE_RATE_LIMIT: false };
  const signIn = (app: ReturnType<typeof buildApp>, headers: Record<string, string> = {}) =>
    app.request('/api/auth/sign-in/email', { method: 'POST', headers });
  let clock = Date.UTC(2026, 0, 1);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // The throttle lives for the process, so each test starts one full interval after the last.
    clock += MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS;
    vi.setSystemTime(clock);
    logged.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('warns on an auth request with no usable address, and answers it as usual', async () => {
    const res = await signIn(buildApp(trusting, log));

    expect(await res.text()).toBe('from-better-auth');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain(AUTH_CLIENT_IP_HEADER);
  });

  it('does not warn on an auth request with a usable address', async () => {
    await signIn(buildApp(trusting, log), { [AUTH_CLIENT_IP_HEADER]: '203.0.113.1' });

    expect(logged).toEqual([]);
  });

  it('honours the declared trusted proxies', async () => {
    await signIn(buildApp({ ...trusting, TRUSTED_PROXIES: ['10.0.0.0/8'] }, log), { [AUTH_CLIENT_IP_HEADER]: '203.0.113.1, 10.0.0.1' });

    expect(logged).toEqual([]);
  });

  it('does not warn with TRUST_PROXY off', async () => {
    await signIn(buildApp({ ...trusting, TRUST_PROXY: false }, log));

    expect(logged).toEqual([]);
  });

  it('does not warn with rate limiting off, when no bucket is shared', async () => {
    await signIn(buildApp({ ...trusting, DISABLE_RATE_LIMIT: true }, log));

    expect(logged).toEqual([]);
  });

  it('keeps the warning out of /healthz: a health check sent straight to the API sets no header', async () => {
    const res = await buildApp(trusting, log).request('/api/healthz');

    expect(await res.json()).toEqual({ status: 'ok' });
    expect(logged).toEqual([]);
  });
});

describe('GET /api/healthz', () => {
  async function expectOnlyUp(providerState: ProviderHealthStateName) {
    hibpStatus.health = providerState;
    captchaStatus.health = providerState;

    const res = await buildApp().request('/api/healthz');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(handler).not.toHaveBeenCalled();
  }

  it.each(Object.values(ProviderHealthState))('answers only that the API is up when both providers are %s', async (providerState) => {
    await expectOnlyUp(providerState);
  });

  it('answers the same when signed in', async () => {
    const user = buildAuthUser({ role: RoleName.ADMIN });
    getSession.mockResolvedValue({ user, session: buildAuthSession({ userId: user.id }) });

    await expectOnlyUp(ProviderHealthState.UNAVAILABLE);
  });
});

describe('GET /api/rate-limit', () => {
  it('is not served, so no open route exists just to show whether rate limiting is on', async () => {
    const res = await buildApp().request('/api/rate-limit');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/config/captcha', () => {
  it('reports captcha off without provider details', async () => {
    const res = await buildApp().request('/api/config/captcha');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
    expect(getSession).toHaveBeenCalledOnce();
  });

  it('returns the public config when on', async () => {
    Object.assign(captchaPublicConfig, { enabled: true, provider: 'hcaptcha', siteKey: 'site' });

    const res = await buildApp().request('/api/config/captcha');

    expect(await res.json()).toEqual({ enabled: true, provider: 'hcaptcha', siteKey: 'site' });
    Object.assign(captchaPublicConfig, { enabled: false, provider: undefined, siteKey: undefined });
  });
});

describe('GET /api/users/me', () => {
  it('returns the signed-in user', async () => {
    const user = buildAuthUser();
    getSession.mockResolvedValue({ user, session: buildAuthSession({ userId: user.id }) });

    const res = await buildApp().request('/api/users/me');

    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }).id).toBe(user.id);
  });

  it('returns the narrowed roles list instead of the stored role', async () => {
    const user = buildAuthUser({ role: 'admin' });
    getSession.mockResolvedValue({ user, session: buildAuthSession({ userId: user.id }) });

    const body = (await (await buildApp().request('/api/users/me')).json()) as Record<string, unknown>;

    expect(body.roles).toEqual(['admin']);
    expect(body).not.toHaveProperty('role');
  });

  it('narrows a multi-valued stored role to the least-privileged role while the switch is off', async () => {
    const user = buildAuthUser({ role: 'admin,support' });
    getSession.mockResolvedValue({ user, session: buildAuthSession({ userId: user.id }) });

    const body = (await (await buildApp().request('/api/users/me')).json()) as { roles: string[] };

    expect(body.roles).toEqual(['user']);
  });

  it('returns null when signed out', async () => {
    const res = await buildApp().request('/api/users/me');

    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });
});

describe('GET /api/config', () => {
  it('is public: returns signUpEnabled without a session', async () => {
    const res = await buildApp().request('/api/config');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signUpEnabled: true, socialProviders: [] });
  });
});
