import { AuthErrorCode, RoleName } from '@adelie/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Auth } from '#lib/server/api/auth/auth.config';
import { type AuthRequest, cookiesFrom, enrolPasskey, signUpWithEmail, signUpWithTotp, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const { password: PASSWORD } = TEST_USER;

let auth: Auth;
let db: Record<string, Record<string, unknown>[]>;
let request: AuthRequest;

beforeEach(() => {
  ({ auth, db, request } = createTestAuth());
});

async function signedInUserId(cookie: string) {
  const { user } = (await (await request('/get-session', { cookie })).json()) as { user: { id: string } };
  return user.id;
}

async function setRole(userId: string, role: string) {
  await (await auth.$context).internalAdapter.updateUser(userId, { role });
}

type Factors = { totp?: boolean; passkeys?: number };

/** A signed-in user with `role` and the given Second Factors. */
async function signedInAs(role: string, { totp = false, passkeys = 0 }: Factors = {}) {
  const { cookie } = await (totp ? signUpWithTotp(request, TEST_USER) : signUpWithEmail(request, TEST_USER));
  const id = await signedInUserId(cookie);
  await setRole(id, role);
  const passkeyIds: string[] = [];
  for (let i = 0; i < passkeys; i++) passkeyIds.push(await enrolPasskey(auth, id));
  return { cookie, id, passkeyIds };
}

const listUsers = (cookie: string) => request('/admin/list-users', { cookie });

async function codeOf(res: Response) {
  return ((await res.json()) as { code?: string }).code;
}

describe('admin plugin endpoints', () => {
  it('refuses an admin without a Second Factor with SECOND_FACTOR_REQUIRED', async () => {
    const admin = await signedInAs(RoleName.ADMIN);

    const res = await listUsers(admin.cookie);

    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe(AuthErrorCode.SECOND_FACTOR_REQUIRED);
  });

  it('refuses a write by an admin without a Second Factor, leaving the target unchanged', async () => {
    const admin = await signedInAs(RoleName.ADMIN);
    const { cookie: otherCookie } = await signUpWithEmail(request, { ...TEST_USER, email: 'other@example.com' });
    const otherId = await signedInUserId(otherCookie);

    const res = await request('/admin/set-role', { cookie: admin.cookie, body: { userId: otherId, role: RoleName.ADMIN } });

    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe(AuthErrorCode.SECOND_FACTOR_REQUIRED);
    expect(db.user.find((u) => u.id === otherId)?.role).toBe(RoleName.USER);
  });

  it('lets an admin with two-factor enabled through', async () => {
    const admin = await signedInAs(RoleName.ADMIN, { totp: true });

    expect((await listUsers(admin.cookie)).status).toBe(200);
  });

  it('lets an admin with a passkey and no two-factor through', async () => {
    const admin = await signedInAs(RoleName.ADMIN, { passkeys: 1 });

    expect((await listUsers(admin.cookie)).status).toBe(200);
  });

  it('treats any stored admin role as admin, as Better Auth itself does', async () => {
    const admin = await signedInAs(`${RoleName.USER},${RoleName.ADMIN}`);

    const res = await listUsers(admin.cookie);

    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe(AuthErrorCode.SECOND_FACTOR_REQUIRED);
  });

  it('lets an admin without a Second Factor check their own permissions, which exercises none', async () => {
    const admin = await signedInAs(RoleName.ADMIN);

    const res = await request('/admin/has-permission', { cookie: admin.cookie, body: { permissions: { user: ['list'] } } });

    expect(res.status).toBe(200);
  });

  it.each([RoleName.SUPPORT, RoleName.USER])("answers a %s with Better Auth's own refusal, not SECOND_FACTOR_REQUIRED", async (role) => {
    const user = await signedInAs(role);

    const res = await listUsers(user.cookie);

    expect(res.status).toBe(403);
    expect(await codeOf(res)).not.toBe(AuthErrorCode.SECOND_FACTOR_REQUIRED);
  });

  it('leaves server-side admin calls without a session alone (the seed)', async () => {
    const created = await auth.api.createUser({ body: { email: 'seeded@example.com', password: PASSWORD, name: 'Seeded', role: RoleName.ADMIN } });

    expect(created.user.role).toBe(RoleName.ADMIN);
  });
});

describe('enrolment by an admin without a Second Factor', () => {
  it('can read its session and start two-factor enrolment', async () => {
    const admin = await signedInAs(RoleName.ADMIN);

    expect((await request('/get-session', { cookie: admin.cookie })).status).toBe(200);
    const enable = await request('/two-factor/enable', { cookie: admin.cookie, body: { password: PASSWORD } });
    expect(enable.status).toBe(200);
  });

  it('can start passkey registration', async () => {
    const admin = await signedInAs(RoleName.ADMIN);

    expect((await request('/passkey/generate-register-options', { cookie: admin.cookie })).status).toBe(200);
  });

  it('gains admin capabilities once enrolled, on the same session', async () => {
    const admin = await signedInAs(RoleName.ADMIN);
    await enrolPasskey(auth, admin.id);

    expect((await listUsers(admin.cookie)).status).toBe(200);
  });
});

describe('removing the last Second Factor', () => {
  const disableTwoFactor = (cookie: string) => request('/two-factor/disable', { cookie, body: { password: PASSWORD } });
  const deletePasskey = (cookie: string, id: string | undefined) => request('/passkey/delete-passkey', { cookie, body: { id } });

  it("refuses to disable an admin's two-factor when it is their only Second Factor, and keeps it enabled", async () => {
    const admin = await signedInAs(RoleName.ADMIN, { totp: true });

    const res = await disableTwoFactor(admin.cookie);

    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe(AuthErrorCode.LAST_SECOND_FACTOR);
    expect(db.user.find((u) => u.id === admin.id)?.twoFactorEnabled).toBe(true);
    expect((await listUsers(admin.cookie)).status).toBe(200);
  });

  it("disables an admin's two-factor when a passkey remains", async () => {
    const admin = await signedInAs(RoleName.ADMIN, { totp: true, passkeys: 1 });

    const res = await disableTwoFactor(admin.cookie);

    expect(res.status).toBe(200);
    expect((await listUsers(cookiesFrom(res, admin.cookie))).status).toBe(200);
  });

  it("refuses to delete an admin's only passkey when two-factor is off, and keeps it", async () => {
    const admin = await signedInAs(RoleName.ADMIN, { passkeys: 1 });

    const res = await deletePasskey(admin.cookie, admin.passkeyIds[0]);

    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe(AuthErrorCode.LAST_SECOND_FACTOR);
    expect(db.passkey).toHaveLength(1);
  });

  it("deletes one of an admin's two passkeys", async () => {
    const admin = await signedInAs(RoleName.ADMIN, { passkeys: 2 });

    const res = await deletePasskey(admin.cookie, admin.passkeyIds[0]);

    expect(res.status).toBe(200);
    expect(db.passkey).toHaveLength(1);
  });

  it("deletes an admin's only passkey when two-factor stays on", async () => {
    const admin = await signedInAs(RoleName.ADMIN, { totp: true, passkeys: 1 });

    expect((await deletePasskey(admin.cookie, admin.passkeyIds[0])).status).toBe(200);
  });

  it("answers an admin deleting a passkey that is not theirs with Better Auth's own refusal", async () => {
    const admin = await signedInAs(RoleName.ADMIN, { passkeys: 1 });
    const othersPasskey = await enrolPasskey(auth, 'someone-else');

    const res = await deletePasskey(admin.cookie, othersPasskey);

    // The passkey plugin's ownership check, which answers 401 for another user's passkey.
    expect(res.status).toBe(401);
    expect(db.passkey).toHaveLength(2);
  });

  it.each([RoleName.SUPPORT, RoleName.USER])('lets a %s remove their last Second Factor', async (role) => {
    const withTotp = await signedInAs(role, { totp: true });
    expect((await disableTwoFactor(withTotp.cookie)).status).toBe(200);

    ({ auth, db, request } = createTestAuth());
    const withPasskey = await signedInAs(role, { passkeys: 1 });
    expect((await deletePasskey(withPasskey.cookie, withPasskey.passkeyIds[0])).status).toBe(200);
  });
});
