import { AuthErrorCode, RoleName, SocialProvider } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { SIGN_UP_ACCEPTED_BODY } from '#lib/server/api/auth/auth.sign-up-response';
import seedUsers from '#lib/server/api/databases/postgres/seeds/users';
import {
  type AuthRequest,
  cookiesFrom,
  hasSessionCookie,
  signUpUnverified,
  signUpWithEmail,
  TEST_USER,
  verifyEmail,
} from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const { password: PASSWORD } = TEST_USER;
const VISITOR_EMAIL = 'visitor@example.com';
const ADMIN_EMAIL = 'admin@example.com';
const NEW_USER = { name: 'Visitor', email: VISITOR_EMAIL, password: PASSWORD };

const signIn = (request: AuthRequest, email: string, password = PASSWORD) => request('/sign-in/email', { body: { email, password } });
/** Creates an admin at `ADMIN_EMAIL` through the admin plugin, the way the seed does. */
const createAdmin = (auth: ReturnType<typeof createTestAuth>['auth']) =>
  auth.api.createUser({ body: { name: 'Admin', email: ADMIN_EMAIL, password: PASSWORD, role: RoleName.ADMIN } });

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

describe('sign-up when closed', () => {
  it('rejects email/password sign-up with Better Auth’s sign-up-disabled code', async () => {
    const { request } = createTestAuth({ signUpEnabled: false });

    const { res } = await signUpWithEmail(request, { ...TEST_USER, email: VISITOR_EMAIL });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED');
  });

  it('creates no user for the rejected request', async () => {
    const { auth, request } = createTestAuth({ signUpEnabled: false });
    await signUpWithEmail(request, { ...TEST_USER, email: VISITOR_EMAIL });

    const { internalAdapter } = await auth.$context;

    expect(await internalAdapter.findUserByEmail(VISITOR_EMAIL)).toBeNull();
  });

  it('lets the server create an admin the way the seed does', async () => {
    const { auth } = createTestAuth({ signUpEnabled: false });

    const { user } = await createAdmin(auth);

    expect(user.role).toBe(RoleName.ADMIN);
  });

  it('lets that seeded admin sign in', async () => {
    const { auth, request } = createTestAuth({ signUpEnabled: false });
    await createAdmin(auth);

    const res = await request('/sign-in/email', { body: { email: ADMIN_EMAIL, password: PASSWORD } });

    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().length).toBeGreaterThan(0);
  });

  it('lets a signed-in admin create another user over HTTP', async () => {
    const { auth, request } = createTestAuth({ signUpEnabled: false });
    await createAdmin(auth);
    const signIn = await request('/sign-in/email', { body: { email: ADMIN_EMAIL, password: PASSWORD } });
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

    const { res } = await signUpWithEmail(request, { ...TEST_USER, email: VISITOR_EMAIL });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SIGN_UP_ACCEPTED_BODY);
  });

  it('creates the unverified user', async () => {
    const { db, request } = createTestAuth({ signUpEnabled: true });

    await signUpUnverified(request, NEW_USER);

    expect(db.user).toEqual([expect.objectContaining({ email: VISITOR_EMAIL, emailVerified: false })]);
  });

  it('gives no session until the email is verified', async () => {
    const { request } = createTestAuth({ signUpEnabled: true });

    const res = await signUpUnverified(request, NEW_USER);

    expect(res.status).toBe(200);
    expect(hasSessionCookie(res)).toBe(false);
  });

  it('sends the verification email', async () => {
    const { request, mailer } = createTestAuth({ signUpEnabled: true });

    await signUpUnverified(request, NEW_USER);

    expect(mailer.sent.map((mail) => mail.to)).toEqual([expect.objectContaining({ email: VISITOR_EMAIL })]);
  });
});

describe('password sign-in before the email is verified', () => {
  it('is refused with Better Auth’s not-verified code and no session', async () => {
    const { request } = createTestAuth({ signUpEnabled: true });
    await signUpUnverified(request, NEW_USER);

    const res = await signIn(request, VISITOR_EMAIL);

    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe(AuthErrorCode.EMAIL_NOT_VERIFIED);
    expect(hasSessionCookie(res)).toBe(false);
  });

  it('still answers a wrong password as a wrong password, so the refusal needs the password', async () => {
    const { request } = createTestAuth({ signUpEnabled: true });
    await signUpUnverified(request, NEW_USER);

    const res = await signIn(request, VISITOR_EMAIL, 'Wrong-horse-9');

    expect(res.status).toBe(401);
  });

  it('sends no email of its own: the login page offers the resend', async () => {
    const { request, mailer } = createTestAuth({ signUpEnabled: true });
    await signUpUnverified(request, NEW_USER);
    mailer.sent.length = 0;

    await signIn(request, VISITOR_EMAIL);

    expect(mailer.sent).toHaveLength(0);
  });

  it('succeeds once the verification link is followed', async () => {
    const { request } = createTestAuth({ signUpEnabled: true });
    await signUpUnverified(request, NEW_USER);

    await verifyEmail(request, VISITOR_EMAIL);
    const res = await signIn(request, VISITOR_EMAIL);

    expect(res.status).toBe(200);
    expect(hasSessionCookie(res)).toBe(true);
  });

  it('lets an unverified address ask for a new verification email', async () => {
    const { request, mailer } = createTestAuth({ signUpEnabled: true });
    await signUpUnverified(request, NEW_USER);
    mailer.sent.length = 0;

    const res = await request('/send-verification-email', { body: { email: VISITOR_EMAIL } });

    expect(res.status).toBe(200);
    expect(mailer.sent.map((mail) => mail.to)).toEqual([expect.objectContaining({ email: VISITOR_EMAIL })]);
  });
});

describe('sign-up with a taken address', () => {
  /** Signs up `VISITOR_EMAIL` and verifies it, so the address is taken by a working account. */
  async function withTakenAddress() {
    const testAuth = createTestAuth({ signUpEnabled: true });
    await signUpWithEmail(testAuth.request, NEW_USER);
    testAuth.mailer.sent.length = 0;
    return testAuth;
  }

  /** What a caller sees of a sign-up response: status, headers and the body as sent, byte for byte. */
  async function observable(res: Response) {
    return { status: res.status, headers: [...res.headers], body: await res.text() };
  }

  it('answers exactly as a sign-up with a new address does', async () => {
    const { request } = await withTakenAddress();

    const taken = await observable(await signUpUnverified(request, { ...NEW_USER, password: 'Other-horse-8' }));
    const fresh = await observable(await signUpUnverified(request, { ...NEW_USER, email: 'newcomer@example.com' }));

    expect(taken.status).toBe(200);
    expect(taken).toEqual(fresh);
  });

  it('sends no email, and changes nothing about the existing account', async () => {
    const { request, mailer, db } = await withTakenAddress();

    await signUpUnverified(request, { ...NEW_USER, name: 'Intruder', password: 'Other-horse-8' });

    expect(mailer.sent).toHaveLength(0);
    expect(db.user).toHaveLength(1);
    expect(db.user[0]).toMatchObject({ name: NEW_USER.name, emailVerified: true });
    expect((await signIn(request, VISITOR_EMAIL)).status).toBe(200);
    expect((await signIn(request, VISITOR_EMAIL, 'Other-horse-8')).status).toBe(401);
  });

  it('answers the same for a taken address that is not verified yet', async () => {
    const { request, db } = createTestAuth({ signUpEnabled: true });
    await signUpUnverified(request, NEW_USER);

    const res = await signUpUnverified(request, NEW_USER);

    expect(res.status).toBe(200);
    expect(hasSessionCookie(res)).toBe(false);
    expect(db.user).toHaveLength(1);
  });
});

describe('users the admin plugin creates', () => {
  it('start verified and can sign in, while sign-up requires verification', async () => {
    const { auth, request } = createTestAuth({ signUpEnabled: true });

    const { user } = await createAdmin(auth);

    expect(user.emailVerified).toBe(true);
    expect((await signIn(request, ADMIN_EMAIL)).status).toBe(200);
  });

  it('include every user the seed creates, who can all sign in', async () => {
    const { auth, request, db } = createTestAuth({ signUpEnabled: true });

    await seedUsers(auth, { adminEmail: ADMIN_EMAIL, adminPassword: PASSWORD });

    expect(db.user.length).toBeGreaterThan(1);
    expect(db.user.every((row) => row.emailVerified === true)).toBe(true);
    expect((await signIn(request, ADMIN_EMAIL)).status).toBe(200);
  });

  it('include a user an admin creates over HTTP', async () => {
    const { auth, request } = createTestAuth({ signUpEnabled: true });
    await createAdmin(auth);
    const cookie = cookiesFrom(await signIn(request, ADMIN_EMAIL));

    await request('/admin/create-user', { cookie, body: { name: 'Invitee', email: 'invitee@example.com', password: PASSWORD } });

    expect((await signIn(request, 'invitee@example.com')).status).toBe(200);
  });

  it('keep an explicit unverified email, which then cannot sign in', async () => {
    const { auth, request } = createTestAuth({ signUpEnabled: true });

    const { user } = await auth.api.createUser({
      body: { name: 'Invitee', email: 'invitee@example.com', password: PASSWORD, data: { emailVerified: false } },
    });

    expect(user.emailVerified).toBe(false);
    expect((await signIn(request, 'invitee@example.com')).status).toBe(403);
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

    const res = await request(path, { body: { name: 'Test User', email: VISITOR_EMAIL, password: PASSWORD } });

    expect(res.ok).toBe(false);
  });
});

describe('sign-up gate for social sign-in', () => {
  const socialSignIn = (request: AuthRequest) =>
    request('/sign-in/social', { body: { provider: SocialProvider.GOOGLE, idToken: { token: 'provider-token' } } });

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

  it('still signs in an unknown email the provider reports as unverified while open, as before verification was required', async () => {
    const unverifiedStranger = {
      ...STRANGER_PROVIDER,
      getUserInfo: async () =>
        ({
          user: { id: 'sub-1', email: 'stranger@example.com', emailVerified: false, name: 'Stranger' },
          data: { sub: 'sub-1' },
        }) as never,
    };
    const { db, request } = createTestAuth({ signUpEnabled: true, socialProviders: { google: unverifiedStranger } });

    const res = await socialSignIn(request);

    expect(res.status).toBe(200);
    expect(hasSessionCookie(res)).toBe(true);
    expect(db.user).toEqual([expect.objectContaining({ email: 'stranger@example.com', emailVerified: false })]);
  });

  it('closes every registered provider, so a provider added later is gated too', async () => {
    const { auth } = createTestAuth({ signUpEnabled: false, socialProviders: { google: STRANGER_PROVIDER, github: STRANGER_PROVIDER } });

    const providers = (await auth.$context).socialProviders;

    expect(providers).toHaveLength(2);
    expect(providers.every((provider) => provider.options?.disableSignUp === true)).toBe(true);
  });
});
