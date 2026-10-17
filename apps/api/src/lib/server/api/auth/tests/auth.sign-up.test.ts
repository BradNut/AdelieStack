import { RoleName } from '@adelie/shared';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '#lib/server/api/auth/auth.config';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Correct-horse-9';
/** The sign-up endpoints that are gated by `signUpEnabled`. A new one must be gated, then listed here. */
const GATED_SIGN_UP_PATHS = ['/sign-up/email'];

/** A provider answered locally: its token check passes and its profile is an unknown, verified email. */
const STRANGER_PROVIDER = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  verifyIdToken: async () => true,
  // Each provider types its user info and raw profile differently; Better Auth only passes them through.
  getUserInfo: async () =>
    ({
      user: { id: 'sub-1', email: 'stranger@example.com', emailVerified: true, name: 'Stranger' },
      data: { sub: 'sub-1' },
    }) as never,
};

function buildAuth(signUpEnabled: boolean, socialProviders?: Parameters<typeof createAuth>[0]['socialProviders']): Auth {
  return createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], twoFactor: [], passkey: [] }),
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    twoFactorIssuer: 'AdelieStack',
    passkey: { rpID: 'localhost', rpName: 'AdelieStack', origin: ORIGIN },
    mailer: { send: async () => {} },
    signUpEnabled,
    // Not about breached passwords: keep these tests off the network.
    hibpEnabled: false,
    socialProviders,
  });
}

/** Drives a real Better Auth endpoint through its HTTP handler, as the Hono mount does. */
function post(auth: Auth, path: string, body: unknown) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: 'POST',
      headers: new Headers({ origin: ORIGIN, 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    }),
  );
}

const signUp = (auth: Auth, email: string) => post(auth, '/sign-up/email', { name: 'Test User', email, password: PASSWORD });

describe('sign-up when closed', () => {
  it('rejects email/password sign-up with Better Auth’s sign-up-disabled code', async () => {
    const auth = buildAuth(false);

    const res = await signUp(auth, 'visitor@example.com');

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED');
  });

  it('creates no user for the rejected request', async () => {
    const auth = buildAuth(false);
    await signUp(auth, 'visitor@example.com');

    const { internalAdapter } = await auth.$context;

    expect(await internalAdapter.findUserByEmail('visitor@example.com')).toBeNull();
  });

  it('lets the server create an admin the way the seed does', async () => {
    const auth = buildAuth(false);

    const { user } = await auth.api.createUser({
      body: { name: 'Admin', email: 'admin@example.com', password: PASSWORD, role: RoleName.ADMIN },
    });

    expect(user.role).toBe(RoleName.ADMIN);
  });

  it('lets that seeded admin sign in', async () => {
    const auth = buildAuth(false);
    await auth.api.createUser({ body: { name: 'Admin', email: 'admin@example.com', password: PASSWORD, role: RoleName.ADMIN } });

    const res = await post(auth, '/sign-in/email', { email: 'admin@example.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().length).toBeGreaterThan(0);
  });

  it('lets a signed-in admin create another user over HTTP', async () => {
    const auth = buildAuth(false);
    await auth.api.createUser({ body: { name: 'Admin', email: 'admin@example.com', password: PASSWORD, role: RoleName.ADMIN } });
    const signIn = await post(auth, '/sign-in/email', { email: 'admin@example.com', password: PASSWORD });
    const cookie = signIn.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');

    const res = await auth.handler(
      new Request(`${ORIGIN}/api/auth/admin/create-user`, {
        method: 'POST',
        headers: new Headers({ origin: ORIGIN, 'content-type': 'application/json', cookie }),
        body: JSON.stringify({ name: 'Invitee', email: 'invitee@example.com', password: PASSWORD, role: RoleName.USER }),
      }),
    );

    expect(res.status).toBe(200);
  });
});

describe('sign-up when open', () => {
  it('accepts email/password sign-up', async () => {
    const auth = buildAuth(true);

    const res = await signUp(auth, 'visitor@example.com');

    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { email: string } }).user.email).toBe('visitor@example.com');
  });
});

describe('sign-up gate coverage', () => {
  it('has no sign-up endpoint beyond the gated ones, so a new plugin path cannot slip past the flag', () => {
    const auth = buildAuth(false);

    const signUpPaths = Object.values(auth.api as Record<string, { path?: string }>)
      .map((endpoint) => endpoint.path)
      .filter((path): path is string => typeof path === 'string' && /sign-?up/i.test(path));

    expect(signUpPaths.sort()).toEqual(GATED_SIGN_UP_PATHS);
  });

  it.each(GATED_SIGN_UP_PATHS)('rejects %s while closed', async (path) => {
    const auth = buildAuth(false);

    const res = await post(auth, path, { name: 'Test User', email: 'visitor@example.com', password: PASSWORD });

    expect(res.ok).toBe(false);
  });
});

describe('sign-up gate for social sign-in', () => {
  const socialSignIn = (auth: Auth) => post(auth, '/sign-in/social', { provider: 'google', idToken: { token: 'provider-token' } });

  it('rejects a social sign-in for an unknown email while closed', async () => {
    const auth = buildAuth(false, { google: STRANGER_PROVIDER });

    const res = await socialSignIn(auth);

    expect(res.ok).toBe(false);
    const { internalAdapter } = await auth.$context;
    expect(await internalAdapter.findUserByEmail('stranger@example.com')).toBeNull();
  });

  it('accepts a social sign-in for an unknown email while open', async () => {
    const res = await socialSignIn(buildAuth(true, { google: STRANGER_PROVIDER }));

    expect(res.status).toBe(200);
  });

  it('closes every registered provider, so a provider added later is gated too', async () => {
    const auth = buildAuth(false, { google: STRANGER_PROVIDER, github: STRANGER_PROVIDER });

    const providers = (await auth.$context).socialProviders;

    expect(providers).toHaveLength(2);
    expect(providers.every((provider) => provider.options?.disableSignUp === true)).toBe(true);
  });
});
