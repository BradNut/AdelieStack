import { beforeEach, describe, expect, it } from 'vitest';
import { type AuthRequest, cookiesFrom } from '../../../../../test/auth-http';
import { createTestAuth, TEST_ORIGIN } from '../../../../../test/auth-instance';

const PASSWORD = 'Correct-horse-9';
const RP_ID = 'example.com';
const RP_NAME = 'Acme Penguins';

let request: AuthRequest;

async function signUp() {
  const res = await request('/sign-up/email', { body: { name: 'Penguin', email: 'penguin@example.com', password: PASSWORD } });
  return cookiesFrom(res);
}

beforeEach(() => {
  ({ request } = createTestAuth({ passkey: { rpID: RP_ID, rpName: RP_NAME, origin: TEST_ORIGIN } }));
});

describe('passkey registration', () => {
  it('issues registration options for the configured relying party to a signed-in user', async () => {
    const cookie = await signUp();

    const res = await request('/passkey/generate-register-options', { cookie });
    const options = (await res.json()) as { challenge: string; rp: { id: string; name: string } };

    expect(res.status).toBe(200);
    expect(options.rp).toEqual({ id: RP_ID, name: RP_NAME });
    expect(options.challenge).toBeTruthy();
  });

  it('supports a roaming security key via the authenticator attachment', async () => {
    const cookie = await signUp();

    const res = await request('/passkey/generate-register-options?authenticatorAttachment=cross-platform', { cookie });
    const options = (await res.json()) as { authenticatorSelection?: { authenticatorAttachment?: string } };

    expect(res.status).toBe(200);
    expect(options.authenticatorSelection?.authenticatorAttachment).toBe('cross-platform');
  });

  it('rejects registration options for a signed-out visitor', async () => {
    const res = await request('/passkey/generate-register-options');

    expect(res.status).toBe(401);
  });

  it('rejects a registration response that matches no issued challenge', async () => {
    const cookie = await signUp();

    const res = await request('/passkey/verify-registration', {
      cookie,
      body: { response: { id: 'x', rawId: 'x', type: 'public-key', response: {}, clientExtensionResults: {} } },
    });

    expect(res.ok).toBe(false);
  });
});

describe('passkey sign-in', () => {
  it('issues authentication options for the configured relying party without a session', async () => {
    const res = await request('/passkey/generate-authenticate-options');
    const options = (await res.json()) as { challenge: string; rpId: string };

    expect(res.status).toBe(200);
    expect(options.rpId).toBe(RP_ID);
    expect(options.challenge).toBeTruthy();
  });

  it('rejects an assertion for an unregistered credential and creates no session', async () => {
    const options = await request('/passkey/generate-authenticate-options');
    const cookie = cookiesFrom(options);

    const res = await request('/passkey/verify-authentication', {
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

    const res = await request('/passkey/list-user-passkeys', { cookie });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('rejects listing for a signed-out visitor', async () => {
    const res = await request('/passkey/list-user-passkeys');

    expect(res.status).toBe(401);
  });

  it('rejects deleting a passkey that does not exist', async () => {
    const cookie = await signUp();

    const res = await request('/passkey/delete-passkey', { cookie, body: { id: 'missing' } });

    expect(res.ok).toBe(false);
  });
});
