import {
  AppEnv,
  AUTH_CLIENT_IP_HEADER,
  DeployEnvironment,
  NodeEnv,
  notFoundMessage,
  RoleName,
  STORAGE_WEBHOOK_ROUTE,
  StatusCodes,
} from '@adelie/shared';
import { Hono } from 'hono';
import { TrieRouter } from 'hono/router/trie-router';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminExampleController } from '#lib/server/api/admin/admin-example.controller';
import { ApplicationController } from '#lib/server/api/application.controller';
import { ProviderHealthState, type ProviderHealthStateName } from '#lib/server/api/auth/auth.provider-health';
import type { AuthService } from '#lib/server/api/auth/auth.service';
import { RolesService } from '#lib/server/api/auth/roles';
import type { ConfigService } from '#lib/server/api/common/configs/config.service';
import { validEnvs } from '#lib/server/api/common/configs/tests/env-fixtures';
import { requestLogger } from '#lib/server/api/common/middleware/request-logger.middleware';
import type { LoggerService } from '#lib/server/api/common/services/logger.service';
import { buildAuthSession, buildAuthUser } from '#lib/server/api/common/testing/factories';
import { MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS } from '#lib/server/api/common/utils/client-address-warning';
import { Forbidden } from '#lib/server/api/common/utils/exceptions';
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
      routes: () => new Hono().post(STORAGE_WEBHOOK_ROUTE, (c) => c.text('from-storage-webhook')),
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

interface RequestLogEntry {
  msg: string;
  reqId: string;
  responseTime: number;
  req: { method: string; url: string };
  res: unknown;
}

/** Everything a request entry may hold: pino's standard fields plus the request allow-list. */
const REQUEST_LOG_FIELDS = ['hostname', 'level', 'msg', 'pid', 'req', 'reqId', 'res', 'responseTime', 'time'];

/** A real pino logger writing to memory, so assertions see exactly what would reach the log output. */
function captureLog() {
  const lines: string[] = [];
  const log = pino({ level: 'info' }, { write: (line: string) => lines.push(line) });
  return {
    log,
    output: () => lines.join(''),
    entries: () => lines.map((line) => JSON.parse(line) as RequestLogEntry),
  };
}

type LogEntry = Record<string, unknown>;

/** The request logger's entries: the ones that carry the request. */
function requestEntries(entries: RequestLogEntry[]): RequestLogEntry[] {
  return entries.filter((entry) => 'req' in entry);
}

/** Every other entry, such as the error handler's `Unexpected error`. */
function errorEntries(entries: RequestLogEntry[]): LogEntry[] {
  return entries.filter((entry) => !('req' in entry)) as unknown as LogEntry[];
}

/** Asserts the request produced exactly one entry, and that it holds nothing beyond the allow-list. */
function expectSingleAllowListedEntry(entries: RequestLogEntry[], res: Response, req: RequestLogEntry['req']) {
  expect(entries).toHaveLength(1);
  const [entry] = entries;
  expect(Object.keys(entry).sort()).toEqual(REQUEST_LOG_FIELDS);
  expect(entry.req).toEqual(req);
  expect(entry.res).toEqual({ status: res.status });
  expect(entry.reqId).toBe(res.headers.get('x-request-id'));
  expect(entry.responseTime).toEqual(expect.any(Number));
}

describe('request logging', () => {
  it('logs only the allow-listed fields of a request, with no header values', async () => {
    const { log, output, entries } = captureLog();

    const res = await buildApp({}, log).request('/api/users/me', {
      headers: {
        Cookie: 'better-auth.session_token=cookie-secret',
        Authorization: 'Bearer bearer-secret',
        'X-Custom-Header': 'custom-header-secret',
      },
    });

    expect(res.status).toBe(200);
    expect(output()).not.toContain('cookie-secret');
    expect(output()).not.toContain('bearer-secret');
    expect(output()).not.toContain('custom-header-secret');

    expectSingleAllowListedEntry(entries(), res, { method: 'GET', url: '/api/users/me' });
    expect(entries()[0].msg).toBe('Request completed');
  });

  it('keeps a password-reset token out of the logged path', async () => {
    const { log, output, entries } = captureLog();

    await buildApp({}, log).request('/api/auth/reset-password/reset-token-secret?callbackURL=/reset');

    expect(output()).not.toContain('reset-token-secret');
    expect(entries()[0].req).toEqual({ method: 'GET', url: '/api/auth/reset-password/[REDACTED]' });
  });

  it.each([
    ['extra segments after the token', '/api/auth/reset-password/reset-token-secret/extra', '/api/auth/reset-password/[REDACTED]'],
    ['a different letter case', '/api/auth/RESET-PASSWORD/reset-token-secret', '/api/auth/RESET-PASSWORD/[REDACTED]'],
    ['a doubled slash', '/api/auth//reset-password//reset-token-secret', '/api/auth//reset-password//[REDACTED]'],
    ['a percent-encoded route name', '/api/auth/reset%2Dpassword/reset-token-secret', '/api/auth/reset-password/[REDACTED]'],
    ['an encoded slash', '/api/auth/reset-password%2Freset-token-secret', '/api/auth/reset-password/[REDACTED]'],
    ['a lower-case encoded slash', '/api/auth/reset-password%2freset-token-secret', '/api/auth/reset-password/[REDACTED]'],
    ['a double-encoded route name', '/api/auth/reset%252Dpassword/reset-token-secret', '/api/auth/reset-password/[REDACTED]'],
    ['a triple-encoded slash', '/api/auth/reset-password%25252Freset-token-secret', '/api/auth/reset-password/[REDACTED]'],
    ['encoded hex digits in an escape', '/api/auth/reset%%32%44password/reset-token-secret', '/api/auth/reset-password/[REDACTED]'],
    ['an encoded query separator', '/api/auth/reset-password%3Ftoken=reset-token-secret', '/api/auth/reset-password?[REDACTED]'],
    ['an encoded backslash', '/api/auth/reset-password%5Creset-token-secret', '/api/auth/reset-password\\[REDACTED]'],
    ['encoding nested past any real client', `/api/auth/reset%${'25'.repeat(12)}2Dpassword/reset-token-secret`, '[REDACTED]'],
  ])('redacts a reset token with %s', async (_case, path, logged) => {
    const { log, output, entries } = captureLog();

    await buildApp({}, log).request(path);

    expect(output()).not.toContain('reset-token-secret');
    expect(entries()[0].req.url).toBe(logged);
  });

  it.each([
    ['a trailing line feed', '/api/auth/reset-password/reset-token-secret%0A', '/api/auth/reset-password/[REDACTED]'],
    ['an interior line feed', '/api/auth/reset-password/reset-token%0Asecret', '/api/auth/reset-password/[REDACTED]'],
    ['a trailing CRLF', '/api/auth/reset-password/reset-token-secret%0D%0A', '/api/auth/reset-password/[REDACTED]'],
    ['a trailing paragraph separator', '/api/auth/reset-password/reset-token-secret%E2%80%A9', '/api/auth/reset-password/[REDACTED]'],
    ['a leading line separator', '/api/auth/reset-password/%E2%80%A8reset-token-secret', '/api/auth/reset-password/[REDACTED]'],
  ])('redacts a reset token with %s', async (_case, path, logged) => {
    const { log, output, entries } = captureLog();
    // Hono's default router never matches a path holding a line terminator, so no middleware runs for one on the
    // real app. TrieRouter does match, which holds the redaction to its promise if the router ever changes.
    const app = new Hono({ router: new TrieRouter() }).use(requestLogger(log)).all('*', (c) => c.text('ok'));

    await app.request(path);

    expect(output()).not.toContain('reset-token-secret');
    expect(entries()[0].req.url).toBe(logged);
  });

  it.each([
    ['verification token', '/api/auth/verify-email?token=verify-token-secret', '/api/auth/verify-email'],
    ['reset token', '/api/auth/reset-password?token=reset-token-secret', '/api/auth/reset-password'],
    ['OAuth code', '/api/auth/callback/google?code=oauth-code-secret&state=oauth-state-secret', '/api/auth/callback/google'],
  ])('keeps a %s in the query string out of the log', async (_case, url, logged) => {
    const { log, output, entries } = captureLog();

    await buildApp({}, log).request(url);

    expect(output()).not.toMatch(/-secret/);
    expect(entries()[0].req.url).toBe(logged);
  });

  it.each([
    ['the reset-password endpoint without a token', '/api/auth/reset-password'],
    ['a route that only starts with the reset-password name', '/api/auth/reset-password-help/topic'],
    ['an ordinary route', '/api/users/me'],
    ['the reset-password endpoint with a trailing slash', '/api/auth/reset-password/'],
    ['an encoded look-alike of a longer route name', '/api/auth/reset-password%252Dhelp/topic'],
    ['an encoded slash on another route', '/api/users%2Fme'],
    ['a double-encoded character on another route', '/api/users/a%2520b'],
  ])('logs %s unchanged', async (_case, path) => {
    const { log, entries } = captureLog();

    await buildApp({}, log).request(path);

    expect(entries()[0].req.url).toBe(path);
  });

  it('keeps the storage webhook secret out of the log', async () => {
    const { log, output, entries } = captureLog();

    await buildApp({}, log).request('/api/storage/webhook', {
      method: 'POST',
      headers: { Authorization: 'Bearer webhook-secret' },
    });

    expect(output()).not.toContain('webhook-secret');
    expect(entries()[0].req).toEqual({ method: 'POST', url: '/api/storage/webhook' });
  });

  it('logs a response without its Set-Cookie value', async () => {
    const { log, output, entries } = captureLog();
    handler.mockImplementation(
      async () => new Response('signed-in', { headers: { 'Set-Cookie': 'better-auth.session_token=set-cookie-secret; HttpOnly' } }),
    );

    const res = await buildApp({}, log).request('/api/auth/sign-in/email', { method: 'POST' });

    expect(res.headers.get('set-cookie')).toContain('set-cookie-secret');
    expect(output()).not.toContain('set-cookie-secret');
    expect(entries()[0].res).toEqual({ status: 200 });
  });

  it('logs a failed request with the same allow-list', async () => {
    const { log, output, entries } = captureLog();
    handler.mockRejectedValue(new Error('auth handler failed for error-message-secret'));

    const res = await buildApp({}, log).request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { Cookie: 'better-auth.session_token=cookie-secret' },
    });

    expect(res.status).toBe(500);
    expect(output()).not.toContain('cookie-secret');
    // The error itself is logged in its own entry (see "error responses"); the request entry keeps to the allow-list.
    const logged = requestEntries(entries());
    expect(JSON.stringify(logged)).not.toContain('error-message-secret');
    expectSingleAllowListedEntry(logged, res, { method: 'POST', url: '/api/auth/sign-in/email' });
    expect(logged[0].msg).toBe('Request failed');
  });

  it('logs an unmatched route with its 404 status', async () => {
    const { log, entries } = captureLog();

    await buildApp({}, log).request('/api/does-not-exist');

    expect(entries()[0].req).toEqual({ method: 'GET', url: '/api/does-not-exist' });
    expect(entries()[0].res).toEqual({ status: 404 });
  });
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

describe('storage webhook mount', () => {
  // Literal on purpose: pins the URL the storage provider is configured with (see STORAGE_WEBHOOK_PATH).
  it('serves the webhook at /api/storage/webhook', async () => {
    const res = await buildApp().request('/api/storage/webhook', { method: 'POST' });

    expect(res.status).toBe(StatusCodes.OK);
    expect(await res.text()).toBe('from-storage-webhook');
  });
});

describe('unknown route', () => {
  // The web proxy builds its refusals from notFoundMessage, so this pins it to what the API really sends.
  it('answers with notFoundMessage JSON', async () => {
    const res = await buildApp().request('/api/no-such-route', { method: 'POST' });

    expect(res.status).toBe(StatusCodes.NOT_FOUND);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ message: notFoundMessage('/api/no-such-route') });
    expect(notFoundMessage('/api/no-such-route')).toBe('Not Found - /api/no-such-route');
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

// The handler's own behaviour (environment gating, redaction, cause chain) is tested in error-handler.middleware.test.ts;
// these check it is the app's handler, behind the request id, locale and logger.
describe('error responses', () => {
  const PRODUCTION_ENVS = { ENV: AppEnv.PROD, ENVIRONMENT: DeployEnvironment.PRODUCTION, NODE_ENV: NodeEnv.PRODUCTION };
  const failure = () => new Error('connect ECONNREFUSED db.internal:5432 for SELECT * FROM users');

  it('decides on error detail from the configured environment', async () => {
    const error = failure();
    getSession.mockRejectedValue(error);

    const res = await buildApp({ ENVIRONMENT: DeployEnvironment.DEVELOPMENT, NODE_ENV: NodeEnv.DEVELOPMENT }).request('/api/users/me');

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ message: error.message, stack: error.stack });
  });

  it('answers an unexpected error in a route with a generic message and the request id', async () => {
    getSession.mockRejectedValue(failure());

    const res = await buildApp(PRODUCTION_ENVS).request('/api/users/me');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      message: 'Something went wrong on our side. Please try again later.',
      requestId: res.headers.get('x-request-id'),
    });
  });

  it('localises the generic message to the request language', async () => {
    getSession.mockRejectedValue(failure());

    const res = await buildApp(PRODUCTION_ENVS).request('/api/users/me', { headers: { 'Accept-Language': 'de' } });

    expect(res.status).toBe(500);
    expect(((await res.json()) as { message: string }).message).toBe('Bei uns ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.');
  });

  it('keeps the status and message of a deliberate client error from the auth mount', async () => {
    const { log, entries } = captureLog();
    handler.mockRejectedValue(Forbidden('You may not do that'));

    const res = await buildApp(PRODUCTION_ENVS, log).request('/api/auth/sign-in/email', { method: 'POST' });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: 'You may not do that', requestId: res.headers.get('x-request-id') });
    expect(errorEntries(entries())).toEqual([]);
  });

  it('logs an unexpected error to the app logger against the request id', async () => {
    const { log, entries } = captureLog();
    getSession.mockRejectedValue(failure());

    const res = await buildApp(PRODUCTION_ENVS, log).request('/api/users/me');

    const logged = errorEntries(entries());
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ msg: 'Unexpected error', reqId: res.headers.get('x-request-id') });
  });
});

describe('GET /api/config', () => {
  it('is public: returns signUpEnabled without a session', async () => {
    const res = await buildApp().request('/api/config');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signUpEnabled: true, socialProviders: [] });
  });
});
