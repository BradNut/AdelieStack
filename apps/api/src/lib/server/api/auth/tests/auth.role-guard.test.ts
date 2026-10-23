import { RoleName } from '@adelie/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Auth } from '#lib/server/api/auth/auth.config';
import { type AuthRequest, cookiesFrom } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const PASSWORD = 'correct-horse-battery-staple';
const MULTI = [RoleName.USER, RoleName.ADMIN];

let auth: Auth;
let request: AuthRequest;
let adminCookie: string;
let targetId: string;

function setup(allowMultipleRoles: boolean) {
  ({ auth, request } = createTestAuth({ allowMultipleRoles: () => allowMultipleRoles }));
}

async function signUp(email: string) {
  const res = await request('/sign-up/email', { body: { name: 'Penguin', email, password: PASSWORD } });
  const cookie = cookiesFrom(res);
  const { user } = (await res.json()) as { user: { id: string } };
  return { cookie, id: user.id };
}

async function prepare(allowMultipleRoles: boolean) {
  setup(allowMultipleRoles);
  const admin = await signUp('admin@example.com');
  await (await auth.$context).internalAdapter.updateUser(admin.id, { role: RoleName.ADMIN });
  adminCookie = admin.cookie;
  targetId = (await signUp('target@example.com')).id;
}

let created = 0;
const paths = {
  'set-role': (role: unknown) => request('/admin/set-role', { cookie: adminCookie, body: { userId: targetId, role } }),
  'create-user': (role: unknown) =>
    request('/admin/create-user', {
      cookie: adminCookie,
      body: { email: `new${created++}@example.com`, password: PASSWORD, name: 'New', role },
    }),
  'update-user': (role: unknown) => request('/admin/update-user', { cookie: adminCookie, body: { userId: targetId, data: { role } } }),
};

describe.each(Object.entries(paths))('admin %s', (_name, write) => {
  describe('with ALLOW_MULTIPLE_ROLES off', () => {
    beforeEach(() => prepare(false));

    it('rejects an array of two roles with a clear error', async () => {
      const res = await write(MULTI);
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).toContain('ALLOW_MULTIPLE_ROLES');
    });

    it('accepts a single role', async () => {
      expect((await write(RoleName.ADMIN)).status).toBe(200);
    });

    it('accepts an array holding one role', async () => {
      expect((await write([RoleName.ADMIN])).status).toBe(200);
    });
  });

  describe('with ALLOW_MULTIPLE_ROLES on', () => {
    beforeEach(() => prepare(true));

    it('accepts an array of roles', async () => {
      expect((await write(MULTI)).status).toBe(200);
    });

    it('accepts a single role', async () => {
      expect((await write(RoleName.ADMIN)).status).toBe(200);
    });
  });
});
