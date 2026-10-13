import { RoleName } from '@adelie/shared';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Auth, createAuth } from '../auth.config';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery-staple';
const MULTI = [RoleName.USER, RoleName.ADMIN];

let auth: Auth;
let adminCookie: string;
let targetId: string;

function setup(allowMultipleRoles: boolean) {
  auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], twoFactor: [] }),
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    twoFactorIssuer: 'AdelieStack',
    passkey: { rpID: 'localhost', rpName: 'AdelieStack', origin: ORIGIN },
    mailer: { send: async () => {} },
    signUpEnabled: true,
    allowMultipleRoles: () => allowMultipleRoles,
  });
}

async function call(path: string, body: unknown, cookie?: string) {
  const headers = new Headers({ origin: ORIGIN, 'content-type': 'application/json' });
  if (cookie) headers.set('cookie', cookie);
  return auth.handler(new Request(`${ORIGIN}/api/auth${path}`, { method: 'POST', headers, body: JSON.stringify(body) }));
}

async function signUp(email: string) {
  const res = await call('/sign-up/email', { name: 'Penguin', email, password: PASSWORD });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
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
  'set-role': (role: unknown) => call('/admin/set-role', { userId: targetId, role }, adminCookie),
  'create-user': (role: unknown) =>
    call('/admin/create-user', { email: `new${created++}@example.com`, password: PASSWORD, name: 'New', role }, adminCookie),
  'update-user': (role: unknown) => call('/admin/update-user', { userId: targetId, data: { role } }, adminCookie),
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
