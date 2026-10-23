import { RoleName } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { type AuthRequest, cookiesFrom } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

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

const signUp = (request: AuthRequest, email: string) => request('/sign-up/email', { body: { name: 'Test User', email, password: PASSWORD } });

describe('sign-up when closed', () => {
  it('rejects email/password sign-up with Better Auth’s sign-up-disabled code', async () => {
    const { request } = createTestAuth({ signUpEnabled: false });

    const res = await signUp(request, 'visitor@example.com');

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED');
  });

  it('creates no user for the rejected request', async () => {
    const { auth, request } = createTestAuth({ signUpEnabled: false });
    await signUp(request, 'visitor@example.com');

    const { internalAdapter } = await auth.$context;

    expect(await internalAdapter.findUserByEmail('visitor@example.com')).toBeNull();
  });

  it('lets the server create an admin the way the seed does', async () => {
    const { auth } = createTestAuth({ signUpEnabled: false });

    const { user } = await auth.api.createUser({
      body: { name: 'Admin', email: 'admin@example.com', password: PASSWORD, role: RoleName.ADMIN },
    });

    expect(user.role).toBe(RoleName.ADMIN);
  });

  it('lets that seeded admin sign in', async () => {
    const { auth, request } = createTestAuth({ signUpEnabled: false });
    await auth.api.createUser({ body: { name: 'Admin', email: 'admin@example.com', password: PASSWORD, role: RoleName.ADMIN } });

    const res = await request('/sign-in/email', { body: { email: 'admin@example.com', password: PASSWORD } });

    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().length).toBeGreaterThan(0);
  });

  it('lets a signed-in admin create another user over HTTP', async () => {
    const { auth, request } = createTestAuth({ signUpEnabled: false });
    await auth.api.createUser({ body: { name: 'Admin', email: 'admin@example.com', password: PASSWORD, role: RoleName.ADMIN } });
    const signIn = await request('/sign-in/email', { body: { email: 'admin@example.com', password: PASSWORD } });
    const cookie = cookiesFrom(signIn);

    const res = await request('/admin/create-user', {
      cookie,
      body: { name: 'Invitee', email: 'invitee@example.com', password: PASSWORD, role: RoleName.USER },
    });

    expect(res.status).toBe(200);
  });
});

describe('sign-up when open', () => {
  it('accepts email/password sign-up', async () => {
    const { request } = createTestAuth({ signUpEnabled: true });

    const res = await signUp(request, 'visitor@example.com');

    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { email: string } }).user.email).toBe('visitor@example.com');
  });
});

describe('sign-up gate coverage', () => {
  it('has no sign-up endpoint beyond the gated ones, so a new plugin path cannot slip past the flag', () => {
    const { auth } = createTestAuth({ signUpEnabled: false });

    const signUpPaths = Object.values(auth.api as Record<string, { path?: string }>)
      .map((endpoint) => endpoint.path)
      .filter((path): path is string => typeof path === 'string' && /sign-?up/i.test(path));

    expect(signUpPaths.sort()).toEqual(GATED_SIGN_UP_PATHS);
  });

  it.each(GATED_SIGN_UP_PATHS)('rejects %s while closed', async (path) => {
    const { request } = createTestAuth({ signUpEnabled: false });

    const res = await request(path, { body: { name: 'Test User', email: 'visitor@example.com', password: PASSWORD } });

    expect(res.ok).toBe(false);
  });
});

describe('sign-up gate for social sign-in', () => {
  const socialSignIn = (request: AuthRequest) => request('/sign-in/social', { body: { provider: 'google', idToken: { token: 'provider-token' } } });

  it('rejects a social sign-in for an unknown email while closed', async () => {
    const { auth, request } = createTestAuth({ signUpEnabled: false, socialProviders: { google: STRANGER_PROVIDER } });

    const res = await socialSignIn(request);

    expect(res.ok).toBe(false);
    const { internalAdapter } = await auth.$context;
    expect(await internalAdapter.findUserByEmail('stranger@example.com')).toBeNull();
  });

  it('accepts a social sign-in for an unknown email while open', async () => {
    const { request } = createTestAuth({ signUpEnabled: true, socialProviders: { google: STRANGER_PROVIDER } });

    const res = await socialSignIn(request);

    expect(res.status).toBe(200);
  });

  it('closes every registered provider, so a provider added later is gated too', async () => {
    const { auth } = createTestAuth({ signUpEnabled: false, socialProviders: { google: STRANGER_PROVIDER, github: STRANGER_PROVIDER } });

    const providers = (await auth.$context).socialProviders;

    expect(providers).toHaveLength(2);
    expect(providers.every((provider) => provider.options?.disableSignUp === true)).toBe(true);
  });
});
