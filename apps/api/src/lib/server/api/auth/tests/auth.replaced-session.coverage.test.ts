import { CaptchaProvider, RoleName } from '@adelie/shared';
import { totpCode } from '@adelie/test-utils/totp';
import { describe, expect, it } from 'vitest';
import { ReplacedSessionPath } from '#lib/server/api/auth/auth.replaced-session';
import { cookiesFrom, signUpWithTotp } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const PASSWORD = 'Correct-horse-9';
const EMAIL = 'penguin@example.com';

/**
 * Endpoints that can set a session cookie but keep their own session handling, so the Replaced Session rule must not
 * touch them. Each is pinned by a behaviour test below.
 */
const KEEPS_OWN_SESSION_HANDLING: Record<string, string> = {
  '/admin/impersonate-user': 'keeps the admin’s session aside in the admin_session cookie, to restore it afterwards',
  '/admin/stop-impersonating': 'ends the impersonation session and restores the admin’s',
  '/two-factor/enable': 'swaps the current session for a new one and deletes the old',
  '/two-factor/disable': 'swaps the current session for a new one and deletes the old',
  '/two-factor/verify-totp': 'signed in, swaps the current session; at a challenge, the Replaced Session already ended at the password step',
  '/two-factor/verify-otp': 'signed in, swaps the current session; at a challenge, the Replaced Session already ended at the password step',
  '/two-factor/verify-backup-code': 'completes a challenge, after the Replaced Session already ended at the password step',
  '/change-password': 'with revokeOtherSessions, deletes every session of the user and sets a new one',
  '/verify-email': 'change-email verification reuses the browser’s session, creating one only when it has none',
};

/** Endpoints that never set a new session: they read, refresh, revoke or change data under the current one. */
const SETS_NO_NEW_SESSION = [
  '/account-info',
  '/admin/ban-user',
  '/admin/create-user',
  '/admin/get-user',
  '/admin/has-permission',
  '/admin/list-user-sessions',
  '/admin/list-users',
  '/admin/remove-user',
  '/admin/revoke-user-session',
  '/admin/revoke-user-sessions',
  '/admin/set-role',
  '/admin/set-user-password',
  '/admin/unban-user',
  '/admin/update-user',
  '/change-email',
  '/delete-user',
  '/delete-user/callback',
  '/error',
  '/get-access-token',
  '/get-session',
  '/link-social',
  '/list-accounts',
  '/list-sessions',
  '/ok',
  '/open-api/generate-schema',
  '/passkey/delete-passkey',
  '/passkey/generate-authenticate-options',
  '/passkey/generate-register-options',
  '/passkey/list-user-passkeys',
  '/passkey/update-passkey',
  '/reference',
  '/refresh-token',
  '/request-password-reset',
  '/reset-password',
  '/reset-password/:token',
  '/revoke-other-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/send-verification-email',
  '/sign-out',
  '/two-factor/generate-backup-codes',
  '/two-factor/get-totp-uri',
  '/two-factor/send-otp',
  '/unlink-account',
  '/update-session',
  '/update-user',
  '/verify-password',
];

/** Every endpoint the auth instance serves, with every optional plugin turned on. */
function registeredPaths() {
  const { auth } = createTestAuth({
    openApiReference: true,
    captcha: { provider: CaptchaProvider.TURNSTILE, secretKey: 'secret', siteKey: 'site' },
  });
  const paths = Object.values(auth.api as Record<string, { path?: string }>).map((endpoint) => endpoint.path);
  return [...new Set(paths.filter((path): path is string => typeof path === 'string'))].sort();
}

describe('Replaced Session coverage', () => {
  it('classifies every auth endpoint, so a new one that creates sessions cannot slip past the rule', () => {
    const classified = [...Object.values(ReplacedSessionPath), ...Object.keys(KEEPS_OWN_SESSION_HANDLING), ...SETS_NO_NEW_SESSION];

    const unclassified = registeredPaths().filter((path) => !classified.includes(path));

    expect(unclassified).toEqual([]);
  });

  it('lists no endpoint that is not registered, or in more than one group', () => {
    const classified = [...Object.values(ReplacedSessionPath), ...Object.keys(KEEPS_OWN_SESSION_HANDLING), ...SETS_NO_NEW_SESSION];

    expect(classified.sort()).toEqual(registeredPaths());
  });
});

describe('endpoints that keep their own session handling', () => {
  function build() {
    const t = createTestAuth();
    const signIn = async (email = EMAIL) => cookiesFrom(await t.request('/sign-in/email', { body: { email, password: PASSWORD } }));
    const signedInAs = async (cookie: string) =>
      ((await (await t.request('/get-session', { cookie })).json()) as { user: { email: string } } | null)?.user.email ?? null;
    return { ...t, signIn, signedInAs };
  }

  it('admin impersonation keeps the admin’s session aside, and stopping restores it', async () => {
    const t = build();
    await t.auth.api.createUser({ body: { name: 'Admin', email: 'admin@example.com', password: PASSWORD, role: RoleName.ADMIN } });
    const { user } = await t.auth.api.createUser({ body: { name: 'Penguin', email: EMAIL, password: PASSWORD, role: RoleName.USER } });
    const adminCookie = await t.signIn('admin@example.com');

    const impersonating = await t.request('/admin/impersonate-user', { cookie: adminCookie, body: { userId: user.id } });
    const asUser = cookiesFrom(impersonating, adminCookie);

    expect(impersonating.status).toBe(200);
    expect(await t.signedInAs(asUser)).toBe(EMAIL);
    expect(await t.signedInAs(adminCookie)).toBe('admin@example.com');

    const stopped = await t.request('/admin/stop-impersonating', { cookie: asUser, body: {} });

    expect(stopped.status).toBe(200);
    expect(await t.signedInAs(cookiesFrom(stopped, asUser))).toBe('admin@example.com');
    expect(await t.signedInAs(asUser)).toBeNull();
  });

  it('confirming two-factor enrolment swaps the current session and keeps the other device', async () => {
    const t = build();
    const signUp = cookiesFrom(await t.request('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } }));
    const otherDevice = await t.signIn();
    const enable = await t.request('/two-factor/enable', { cookie: signUp, body: { password: PASSWORD } });
    const { totpURI } = (await enable.json()) as { totpURI: string };
    const enrolled = cookiesFrom(enable, signUp);

    const verify = await t.request('/two-factor/verify-totp', { cookie: enrolled, body: { code: totpCode(totpURI) } });

    expect(verify.status).toBe(200);
    expect(await t.signedInAs(enrolled)).toBeNull();
    expect(await t.signedInAs(cookiesFrom(verify, enrolled))).toBe(EMAIL);
    expect(await t.signedInAs(otherDevice)).toBe(EMAIL);
    expect(t.db.session).toHaveLength(2);
  });

  it('turning two-factor off swaps the current session and keeps the other device', async () => {
    const t = build();
    const { cookie, totpURI } = await signUpWithTotp(t.request, { name: 'Penguin', email: EMAIL, password: PASSWORD });
    const challenge = await t.request('/sign-in/email', { body: { email: EMAIL, password: PASSWORD } });
    const otherDevice = cookiesFrom(
      await t.request('/two-factor/verify-totp', { cookie: cookiesFrom(challenge), body: { code: totpCode(totpURI) } }),
    );

    const disable = await t.request('/two-factor/disable', { cookie, body: { password: PASSWORD } });

    expect(disable.status).toBe(200);
    expect(await t.signedInAs(cookie)).toBeNull();
    expect(await t.signedInAs(cookiesFrom(disable, cookie))).toBe(EMAIL);
    expect(await t.signedInAs(otherDevice)).toBe(EMAIL);
    expect(t.db.session).toHaveLength(2);
  });

  it('changing the password with “sign out other sessions” leaves only the new session', async () => {
    const t = build();
    const cookie = cookiesFrom(await t.request('/sign-up/email', { body: { name: 'Penguin', email: EMAIL, password: PASSWORD } }));
    const otherDevice = await t.signIn();

    const res = await t.request('/change-password', {
      cookie,
      body: { currentPassword: PASSWORD, newPassword: 'Another-horse-9', revokeOtherSessions: true },
    });

    expect(res.status).toBe(200);
    expect(await t.signedInAs(cookie)).toBeNull();
    expect(await t.signedInAs(otherDevice)).toBeNull();
    expect(await t.signedInAs(cookiesFrom(res, cookie))).toBe(EMAIL);
    expect(t.db.session).toHaveLength(1);
  });
});
