import { RoleName } from '@adelie/shared';
import { onError } from 'stoker/middlewares';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { roles } from '../../auth/auth.permissions';
import type { AuthService } from '../../auth/auth.service';
import { type RolesService, resolveRoles } from '../../auth/roles';
import { buildAuthSession, buildAuthUser } from '../../common/testing/factories';
import { createHono } from '../../common/utils/hono';
import { AdminExampleController } from '../admin-example.controller';

const roleSwitch = vi.hoisted(() => ({ allowMultiple: false }));

// The switch is replaced; the narrowing itself stays real.
const rolesService = {
  rolesOf: (user: { role?: string | null }) => resolveRoles(user.role, { allowMultiple: roleSwitch.allowMultiple, logger: { warn: () => {} } }),
} as unknown as RolesService;

type PermissionBody = { role?: string; permissions: Record<string, string[]> };

const getSession = vi.fn();
/** Mirrors Better Auth's admin `userHasPermission` for a role value: any listed role granting it passes. */
const userHasPermission = vi.fn(async ({ body }: { body: PermissionBody; headers?: Headers }) => ({
  success: (body.role ?? '').split(',').some((name) => roles[name as keyof typeof roles]?.authorize(body.permissions).success === true),
  error: null,
}));
const authService = { auth: { api: { getSession, userHasPermission } } } as unknown as AuthService;

function signIn(role: string | null) {
  const user = buildAuthUser({ role });
  getSession.mockResolvedValue({ user, session: buildAuthSession({ userId: user.id }) });
}

function request() {
  const app = createHono().route('/admin', new AdminExampleController(authService, rolesService).routes() as never);
  app.onError(onError);
  return app.request('/admin/example', { headers: { cookie: 'better-auth.session_token=abc' } });
}

describe('admin example route', () => {
  beforeEach(() => {
    getSession.mockReset().mockResolvedValue(null);
    userHasPermission.mockClear();
    roleSwitch.allowMultiple = false;
  });

  it('rejects a request without a session as unauthorized', async () => {
    const res = await request();

    expect(res.status).toBe(401);
    expect(userHasPermission).not.toHaveBeenCalled();
  });

  it.each([RoleName.SUPPORT, RoleName.USER])('forbids a %s, who lacks the permission', async (role) => {
    signIn(role);

    expect((await request()).status).toBe(403);
  });

  it('forbids a user with no stored role', async () => {
    signIn(null);

    expect((await request()).status).toBe(403);
  });

  it('lets a single-role admin through', async () => {
    signIn(RoleName.ADMIN);

    const res = await request();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ message: 'admin' });
  });

  it('lets a multi-role user through when the second role grants the permission and multiple roles are allowed', async () => {
    roleSwitch.allowMultiple = true;
    signIn(`${RoleName.USER},${RoleName.ADMIN}`);

    expect((await request()).status).toBe(200);
  });

  it('gives a multi-valued stored role least privilege when multiple roles are not allowed', async () => {
    signIn(`${RoleName.USER},${RoleName.ADMIN}`);

    expect((await request()).status).toBe(403);
  });

  it('reads the session from the request headers but passes only the narrowed roles to the permission check', async () => {
    roleSwitch.allowMultiple = true;
    signIn(`${RoleName.USER},${RoleName.ADMIN}`);

    await request();

    const [{ headers }] = getSession.mock.calls[0] as [{ headers: Headers }];
    expect(headers.get('cookie')).toBe('better-auth.session_token=abc');
    expect(userHasPermission).toHaveBeenCalledTimes(2);
    const calls = userHasPermission.mock.calls.map(([call]) => call);
    for (const call of calls) {
      expect(call?.headers).toBeUndefined();
    }
    expect(calls.map((call) => call?.body.role)).toEqual([RoleName.USER, RoleName.ADMIN]);
  });
});
