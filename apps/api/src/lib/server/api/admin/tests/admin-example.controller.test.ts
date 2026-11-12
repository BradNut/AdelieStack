import { AuthErrorCode, DeployEnvironment, NodeEnv, RoleName } from '@adelie/shared';
import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminExampleController } from '#lib/server/api/admin/admin-example.controller';
import { roles } from '#lib/server/api/auth/auth.permissions';
import type { AuthService } from '#lib/server/api/auth/auth.service';
import { type RolesService, resolveRoles } from '#lib/server/api/auth/roles';
import { errorHandler } from '#lib/server/api/common/middleware/error-handler.middleware';
import { buildAuthUser } from '#lib/server/api/common/testing/factories';
import { createHono } from '#lib/server/api/common/utils/hono';

const roleSwitch = vi.hoisted(() => ({ allowMultiple: false }));

// The switch is replaced; the narrowing itself stays real.
const rolesService = {
  rolesOf: (user: { role?: string | null }) => resolveRoles(user.role, { allowMultiple: roleSwitch.allowMultiple, logger: { warn: () => {} } }),
} as unknown as RolesService;

type PermissionBody = { role?: string; permissions: Record<string, string[]> };

let currentUser: ReturnType<typeof buildAuthUser> | null = null;
/** Mirrors Better Auth's admin `userHasPermission` for a role value: any listed role granting it passes. */
const userHasPermission = vi.fn(async ({ body }: { body: PermissionBody; headers?: Headers }) => ({
  success: (body.role ?? '').split(',').some((name) => roles[name as keyof typeof roles]?.authorize(body.permissions).success === true),
  error: null,
}));
/** Whether the signed-in account has a Second Factor; the check itself is covered in auth.second-factor.test.ts. */
const hasSecondFactor = vi.fn(async () => true);
const authService = { auth: { api: { userHasPermission } }, hasSecondFactor } as unknown as AuthService;

function signIn(role: string | null) {
  currentUser = buildAuthUser({ role });
}

function request() {
  const app = createHono();
  // Stands in for the app-wide `authSession` middleware, which `requirePermission` relies on.
  app.use('*', async (c, next) => {
    c.set('user', currentUser);
    await next();
  });
  app.route('/admin', new AdminExampleController(authService, rolesService).routes() as never);
  app.onError(errorHandler({ envs: { ENVIRONMENT: DeployEnvironment.PRODUCTION, NODE_ENV: NodeEnv.PRODUCTION }, logger: pino({ enabled: false }) }));
  return app.request('/admin/example');
}

describe('admin example route', () => {
  beforeEach(() => {
    currentUser = null;
    userHasPermission.mockClear();
    hasSecondFactor.mockReset().mockResolvedValue(true);
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

  it('refuses an admin without a Second Factor with SECOND_FACTOR_REQUIRED', async () => {
    hasSecondFactor.mockResolvedValue(false);
    signIn(RoleName.ADMIN);

    const res = await request();

    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe(AuthErrorCode.SECOND_FACTOR_REQUIRED);
    expect(hasSecondFactor).toHaveBeenCalledWith(currentUser);
  });

  it.each([RoleName.SUPPORT, RoleName.USER])('answers a %s without a Second Factor with the plain role refusal', async (role) => {
    hasSecondFactor.mockResolvedValue(false);
    signIn(role);

    const res = await request();

    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBeUndefined();
  });

  it('does not look up Second Factors for a request the roles already refuse', async () => {
    signIn(RoleName.USER);

    await request();

    expect(hasSecondFactor).not.toHaveBeenCalled();
  });

  it('passes only the narrowed roles to the permission check, with no headers', async () => {
    roleSwitch.allowMultiple = true;
    signIn(`${RoleName.USER},${RoleName.ADMIN}`);

    await request();

    expect(userHasPermission).toHaveBeenCalledTimes(2);
    const calls = userHasPermission.mock.calls.map(([call]) => call);
    for (const call of calls) {
      expect(call?.headers).toBeUndefined();
    }
    expect(calls.map((call) => call?.body.role)).toEqual([RoleName.USER, RoleName.ADMIN]);
  });
});
