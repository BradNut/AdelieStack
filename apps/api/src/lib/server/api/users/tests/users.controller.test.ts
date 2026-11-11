import { RoleName } from '@adelie/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthService } from '#lib/server/api/auth/auth.service';
import { type RolesService, resolveRoles } from '#lib/server/api/auth/roles';
import { buildAuthUser } from '#lib/server/api/common/testing/factories';
import { createHono } from '#lib/server/api/common/utils/hono';
import { UsersController } from '#lib/server/api/users/users.controller';

const rolesService = {
  rolesOf: (user: { role?: string | null }) => resolveRoles(user.role, { allowMultiple: false, logger: { warn: () => {} } }),
} as unknown as RolesService;

/** Whether the account has a Second Factor; the check itself is covered in auth.second-factor.test.ts. */
const hasSecondFactor = vi.fn(async () => false);
const authService = { hasSecondFactor } as unknown as AuthService;

let currentUser: ReturnType<typeof buildAuthUser> | null = null;

async function me() {
  const app = createHono();
  app.use('*', async (c, next) => {
    c.set('user', currentUser);
    await next();
  });
  app.route('/users', new UsersController(rolesService, authService).routes() as never);
  return (await app.request('/users/me')).json() as Promise<Record<string, unknown> | null>;
}

describe('GET /users/me', () => {
  beforeEach(() => {
    currentUser = null;
    hasSecondFactor.mockReset().mockResolvedValue(false);
  });

  it('answers null when signed out', async () => {
    expect(await me()).toBeNull();
  });

  it('reports that an admin without a Second Factor needs one', async () => {
    currentUser = buildAuthUser({ role: RoleName.ADMIN });

    expect(await me()).toMatchObject({ roles: [RoleName.ADMIN], needsSecondFactor: true });
  });

  it('reports that an admin with a Second Factor needs none', async () => {
    hasSecondFactor.mockResolvedValue(true);
    currentUser = buildAuthUser({ role: RoleName.ADMIN, twoFactorEnabled: true });

    expect(await me()).toMatchObject({ needsSecondFactor: false });
  });

  it.each([RoleName.SUPPORT, RoleName.USER])('never asks a %s for a Second Factor, nor looks one up', async (role) => {
    currentUser = buildAuthUser({ role });

    expect(await me()).toMatchObject({ roles: [role], needsSecondFactor: false });
    expect(hasSecondFactor).not.toHaveBeenCalled();
  });

  it('keeps the stored role value out of the answer', async () => {
    currentUser = buildAuthUser({ role: RoleName.ADMIN });

    expect(await me()).not.toHaveProperty('role');
  });
});
