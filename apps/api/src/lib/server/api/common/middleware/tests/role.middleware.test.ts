import { RoleName } from '@adelie/shared';
import { beforeEach, describe, expect, it } from 'vitest';
// The harness must be imported before the mocked middleware so its vi.mock calls register first.
import { buildRouteApp, resetRouteTestMocks } from '../../testing/route-test-harness';
import type { AuthUser } from '../../../auth/auth.config';
import { Controller } from '../../factories/controllers.factory';
import { buildAuthUser } from '../../testing/factories';
import { onError } from 'stoker/middlewares';
import { adminAndSupportRoleOnly, adminRoleOnly } from '../role.middleware';

/** Stands in for a real controller with one admin-only and one shared support route. */
class SampleController extends Controller {
  routes() {
    return this.controller
      .get('/admin', adminRoleOnly, (c) => c.json({ message: 'admin' }))
      .get('/support', adminAndSupportRoleOnly, (c) => c.json({ message: 'support' }));
  }
}

function request(path: string, user: AuthUser | null) {
  const app = buildRouteApp(new SampleController().routes(), '/sample', { user });
  app.onError(onError);
  return app.request(`/sample${path}`);
}

const asRole = (role: string) => buildAuthUser({ role });

describe('role middleware', () => {
  beforeEach(() => {
    resetRouteTestMocks();
  });

  describe('adminRoleOnly', () => {
    it('lets an admin through', async () => {
      const res = await request('/admin', asRole(RoleName.ADMIN));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ message: 'admin' });
    });

    it.each([RoleName.SUPPORT, RoleName.USER])('forbids a %s', async (role) => {
      const res = await request('/admin', asRole(role));

      expect(res.status).toBe(403);
    });

    it('rejects a signed-out request as unauthorized', async () => {
      const res = await request('/admin', null);

      expect(res.status).toBe(401);
    });

    it('lets through a user holding admin among several roles', async () => {
      const res = await request('/admin', asRole(`${RoleName.USER},${RoleName.ADMIN}`));

      expect(res.status).toBe(200);
    });

    it('forbids a user with no role', async () => {
      const res = await request('/admin', buildAuthUser({ role: null }));

      expect(res.status).toBe(403);
    });
  });

  describe('adminAndSupportRoleOnly', () => {
    it.each([RoleName.ADMIN, RoleName.SUPPORT])('lets a %s through', async (role) => {
      const res = await request('/support', asRole(role));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ message: 'support' });
    });

    it('forbids a user', async () => {
      const res = await request('/support', asRole(RoleName.USER));

      expect(res.status).toBe(403);
    });

    it('rejects a signed-out request as unauthorized', async () => {
      const res = await request('/support', null);

      expect(res.status).toBe(401);
    });

    it('does not match a role that only contains "admin" as a substring', async () => {
      const res = await request('/support', asRole('superadmin'));

      expect(res.status).toBe(403);
    });
  });
});
