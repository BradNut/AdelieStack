import { injectable } from '@needle-di/core';
import { rolesOf } from '../auth/roles';
import { Controller } from '../common/factories/controllers.factory';

@injectable()
export class UsersController extends Controller {
  routes() {
    // Account changes (profile, email, password, deletion) go through Better Auth at /api/auth/*.
    return this.controller.get('/me', (c) => {
      const user = c.var.user;
      if (!user) return c.json(null);
      const { role: _stored, ...rest } = user;
      return c.json({ ...rest, roles: rolesOf(user) });
    });
  }
}
