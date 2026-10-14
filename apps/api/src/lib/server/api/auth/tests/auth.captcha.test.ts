import { createHash } from 'node:crypto';
import {
  CAPTCHA_MISSING_RESPONSE,
  CAPTCHA_PROTECTED_PATHS,
  CAPTCHA_RESPONSE_HEADER,
  CAPTCHA_UNAVAILABLE,
  CAPTCHA_VERIFICATION_FAILED,
  CaptchaProvider,
} from '@adelie/shared';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAPTCHA_VERIFY_FAILED_LOG, CaptchaHealth, CaptchaStatus } from '#lib/server/api/auth/auth.captcha';
import { createAuth } from '#lib/server/api/auth/auth.config';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct horse battery';
const PWNED_PASSWORD = 'password12345';
const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const HIBP_HOST = 'https://api.pwnedpasswords.com/range/';
const TOKEN = 'token-from-widget';

const sha1 = (value: string) => createHash('sha1').update(value).digest('hex').toUpperCase();

type Verify = 'valid' | 'invalid' | 'down';

/** Stubs the provider verify call and HIBP; returns the mock so tests can inspect outbound calls. */
function stubNetwork(verify: Verify = 'valid', verifyUrl = TURNSTILE_VERIFY) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === verifyUrl) {
      if (verify === 'down') throw new TypeError('fetch failed');
      return Response.json({ success: verify === 'valid' });
    }
    if (url.startsWith(HIBP_HOST)) {
      const lines = [PWNED_PASSWORD].map(sha1).filter((h) => h.startsWith(url.slice(HIBP_HOST.length)));
      return new Response(lines.map((h) => `${h.slice(5)}:42`).join('\r\n') || '0000000000000000000000000000000000A:0');
    }
    throw new Error(`unexpected network call: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const verifyCalls = (fetchMock: ReturnType<typeof stubNetwork>, url = TURNSTILE_VERIFY) =>
  fetchMock.mock.calls.filter(([input]) => String(input) === url);
const hibpCalls = (fetchMock: ReturnType<typeof stubNetwork>) => fetchMock.mock.calls.filter(([input]) => String(input).startsWith(HIBP_HOST));

function build(
  captcha: { provider: CaptchaProvider; secretKey: string; siteKey: string; minScore?: number } | null = {
    provider: CaptchaProvider.TURNSTILE,
    secretKey: 'secret',
    siteKey: 'site',
  },
) {
  const log = { error: vi.fn() };
  const captchaStatus = new CaptchaStatus({ enabled: Boolean(captcha), log });
  const db = { user: [], session: [], account: [], verification: [], twoFactor: [], passkey: [] };
  const auth = createAuth({
    database: memoryAdapter(db),
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    twoFactorIssuer: 'AdelieStack',
    signUpEnabled: true,
    passkey: { rpID: 'localhost', rpName: 'AdelieStack', origin: ORIGIN },
    mailer: { send: async () => {} },
    captcha: captcha ?? undefined,
    captchaStatus,
  });
  const post = (path: string, body: unknown, token?: string) => {
    const headers = new Headers({ origin: ORIGIN, 'content-type': 'application/json' });
    if (token) headers.set(CAPTCHA_RESPONSE_HEADER, token);
    return auth.handler(new Request(`${ORIGIN}/api/auth${path}`, { method: 'POST', headers, body: JSON.stringify(body) }));
  };
  return { auth, log, captchaStatus, post };
}

const BODY_BY_PATH: Record<(typeof CAPTCHA_PROTECTED_PATHS)[number], unknown> = {
  '/sign-up/email': { name: 'T', email: 'c@example.com', password: PASSWORD },
  '/sign-in/email': { email: 'c@example.com', password: PASSWORD },
  '/request-password-reset': { email: 'c@example.com', redirectTo: `${ORIGIN}/reset` },
  '/send-verification-email': { email: 'c@example.com' },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('captcha disabled', () => {
  it('challenges no path and never calls the provider', async () => {
    const fetchMock = stubNetwork();
    const { post, captchaStatus } = build(null);

    const res = await post('/sign-up/email', BODY_BY_PATH['/sign-up/email']);

    expect(res.status).toBe(200);
    expect(verifyCalls(fetchMock)).toHaveLength(0);
    expect(captchaStatus.health).toBe(CaptchaHealth.DISABLED);
  });
});

describe('captcha enabled', () => {
  it.each(CAPTCHA_PROTECTED_PATHS)('rejects a missing token on %s', async (path) => {
    const fetchMock = stubNetwork();
    const { post } = build();

    const res = await post(path, BODY_BY_PATH[path]);

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(CAPTCHA_MISSING_RESPONSE);
    expect(verifyCalls(fetchMock)).toHaveLength(0);
  });

  it.each(CAPTCHA_PROTECTED_PATHS)('rejects a token the provider refuses on %s', async (path) => {
    stubNetwork('invalid');
    const { post } = build();

    const res = await post(path, BODY_BY_PATH[path], TOKEN);

    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe(CAPTCHA_VERIFICATION_FAILED);
  });

  it.each(CAPTCHA_PROTECTED_PATHS)('lets a valid token through on %s', async (path) => {
    const fetchMock = stubNetwork('valid');
    const { post } = build();

    const res = await post(path, BODY_BY_PATH[path], TOKEN);

    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(503);
    expect(verifyCalls(fetchMock)).toHaveLength(1);
  });

  it('does not challenge passkey, social, session-bound or two-factor paths', async () => {
    const fetchMock = stubNetwork();
    const { post } = build();

    for (const path of ['/sign-in/social', '/passkey/generate-authenticate-options', '/two-factor/send-otp', '/sign-out']) {
      const res = await post(path, {});
      expect(await res.clone().text()).not.toContain(CAPTCHA_MISSING_RESPONSE);
    }
    expect(verifyCalls(fetchMock)).toHaveLength(0);
  });

  it('verifies the token before the breached-password screen, so a bad token costs no HIBP lookup', async () => {
    const fetchMock = stubNetwork('invalid');
    const { post } = build();

    const res = await post('/sign-up/email', { name: 'T', email: 'c@example.com', password: PWNED_PASSWORD }, TOKEN);

    expect(res.status).toBe(403);
    expect(hibpCalls(fetchMock)).toHaveLength(0);
  });

  it('rejects a missing token before any HIBP lookup too', async () => {
    const fetchMock = stubNetwork();
    const { post } = build();

    await post('/sign-up/email', { name: 'T', email: 'c@example.com', password: PWNED_PASSWORD });

    expect(hibpCalls(fetchMock)).toHaveLength(0);
  });

  it('works with another provider (hCaptcha) against its own verify endpoint', async () => {
    const fetchMock = stubNetwork('valid', 'https://api.hcaptcha.com/siteverify');
    const { post } = build({ provider: CaptchaProvider.HCAPTCHA, secretKey: 'secret', siteKey: 'site' });

    const res = await post('/sign-in/email', BODY_BY_PATH['/sign-in/email'], TOKEN);

    expect(verifyCalls(fetchMock, 'https://api.hcaptcha.com/siteverify')).toHaveLength(1);
    expect(res.status).not.toBe(503);
  });
});

describe('captcha provider outage', () => {
  it.each(CAPTCHA_PROTECTED_PATHS)('fails closed with 503 and the stable code on %s', async (path) => {
    stubNetwork('down');
    const { post } = build();

    const res = await post(path, BODY_BY_PATH[path], TOKEN);

    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe(CAPTCHA_UNAVAILABLE);
  });

  it('answers differently from an invalid token', async () => {
    stubNetwork('down');
    const { post } = build();
    const outage = await post('/sign-in/email', BODY_BY_PATH['/sign-in/email'], TOKEN);
    stubNetwork('invalid');
    const invalid = await post('/sign-in/email', BODY_BY_PATH['/sign-in/email'], TOKEN);

    expect(outage.status).not.toBe(invalid.status);
  });

  it('logs each outage with the greppable prefix and reports unavailable on the health surface', async () => {
    stubNetwork('down');
    const { post, log, captchaStatus } = build();

    await post('/sign-in/email', BODY_BY_PATH['/sign-in/email'], TOKEN);

    expect(log.error).toHaveBeenCalledOnce();
    expect(String(log.error.mock.calls[0]?.[1])).toContain(CAPTCHA_VERIFY_FAILED_LOG);
    expect(captchaStatus.health).toBe(CaptchaHealth.UNAVAILABLE);
  });

  it('reports unknown before any check, available after a good one and available after a refused token', async () => {
    const { post, captchaStatus } = build();
    expect(captchaStatus.health).toBe(CaptchaHealth.UNKNOWN);

    stubNetwork('valid');
    await post('/sign-in/email', BODY_BY_PATH['/sign-in/email'], TOKEN);
    expect(captchaStatus.health).toBe(CaptchaHealth.AVAILABLE);

    stubNetwork('down');
    await post('/sign-in/email', BODY_BY_PATH['/sign-in/email'], TOKEN);
    expect(captchaStatus.health).toBe(CaptchaHealth.UNAVAILABLE);

    stubNetwork('invalid');
    await post('/sign-in/email', BODY_BY_PATH['/sign-in/email'], TOKEN);
    expect(captchaStatus.health).toBe(CaptchaHealth.AVAILABLE);
  });

  it('does not touch the health state for a request with no token', async () => {
    stubNetwork('down');
    const { post, captchaStatus } = build();

    await post('/sign-in/email', BODY_BY_PATH['/sign-in/email']);

    expect(captchaStatus.health).toBe(CaptchaHealth.UNKNOWN);
  });

  it('is bypassed by turning captcha off (the kill switch)', async () => {
    const fetchMock = stubNetwork('down');
    const { post } = build(null);

    const res = await post('/sign-in/email', BODY_BY_PATH['/sign-in/email']);

    expect(res.status).not.toBe(503);
    expect(verifyCalls(fetchMock)).toHaveLength(0);
  });
});
