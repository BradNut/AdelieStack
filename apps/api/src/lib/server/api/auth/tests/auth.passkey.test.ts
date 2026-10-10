import { memoryAdapter } from 'better-auth/adapters/memory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendProps } from '../../mail/interfaces/mailer.interface';
import { type Auth, createAuth } from '../auth.config';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
const RP_ID = 'example.com';
const RP_NAME = 'Acme Penguins';

let auth: Auth;
const send = vi.fn<(data: SendProps) => Promise<void>>();

async function call(path: string, { body, cookie, method }: { body?: unknown; cookie?: string; method?: string } = {}) {
  const headers = new Headers({ origin: ORIGIN });
  if (cookie) headers.set('cookie', cookie);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function signUp() {
  const res = await call('/sign-up/email', { body: { name: 'Penguin', email: 'penguin@example.com', password: PASSWORD } });
  return cookiesFrom(res);
}

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue();
  auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], twoFactor: [], passkey: [] }),
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    twoFactorIssuer: 'AdelieStack',
    passkey: { rpID: RP_ID, rpName: RP_NAME, origin: ORIGIN },
    mailer: { send },
  });
});

describe('passkey registration', () => {
  it('issues registration options for the configured relying party to a signed-in user', async () => {
    const cookie = await signUp();

    const res = await call('/passkey/generate-register-options', { cookie });
    const options = (await res.json()) as { challenge: string; rp: { id: string; name: string } };

    expect(res.status).toBe(200);
    expect(options.rp).toEqual({ id: RP_ID, name: RP_NAME });
    expect(options.challenge).toBeTruthy();
  });

  it('supports a roaming security key via the authenticator attachment', async () => {
    const cookie = await signUp();

    const res = await call('/passkey/generate-register-options?authenticatorAttachment=cross-platform', { cookie });
    const options = (await res.json()) as { authenticatorSelection?: { authenticatorAttachment?: string } };

    expect(res.status).toBe(200);
    expect(options.authenticatorSelection?.authenticatorAttachment).toBe('cross-platform');
  });

  it('rejects registration options for a signed-out visitor', async () => {
    const res = await call('/passkey/generate-register-options');

    expect(res.status).toBe(401);
  });

  it('rejects a registration response that matches no issued challenge', async () => {
    const cookie = await signUp();

    const res = await call('/passkey/verify-registration', {
      cookie,
      body: { response: { id: 'x', rawId: 'x', type: 'public-key', response: {}, clientExtensionResults: {} } },
    });

    expect(res.ok).toBe(false);
  });
});

describe('passkey sign-in', () => {
  it('issues authentication options for the configured relying party without a session', async () => {
    const res = await call('/passkey/generate-authenticate-options');
    const options = (await res.json()) as { challenge: string; rpId: string };

    expect(res.status).toBe(200);
    expect(options.rpId).toBe(RP_ID);
    expect(options.challenge).toBeTruthy();
  });

  it('rejects an assertion for an unregistered credential and creates no session', async () => {
    const options = await call('/passkey/generate-authenticate-options');
    const cookie = cookiesFrom(options);

    const res = await call('/sign-in/passkey', {
      cookie,
      body: { response: { id: 'unknown', rawId: 'unknown', type: 'public-key', response: {}, clientExtensionResults: {} } },
    });

    expect(res.ok).toBe(false);
    expect(cookiesFrom(res)).not.toContain('session_token');
  });
});

describe('passkey management', () => {
  it('lists no passkeys for a new user', async () => {
    const cookie = await signUp();

    const res = await call('/passkey/list-user-passkeys', { cookie });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('rejects listing for a signed-out visitor', async () => {
    const res = await call('/passkey/list-user-passkeys');

    expect(res.status).toBe(401);
  });

  it('rejects deleting a passkey that does not exist', async () => {
    const cookie = await signUp();

    const res = await call('/passkey/delete-passkey', { cookie, body: { id: 'missing' } });

    expect(res.ok).toBe(false);
  });
});
