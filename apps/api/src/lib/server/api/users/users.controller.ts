import { inject, injectable } from '@needle-di/core';
import { RolesService } from '../auth/roles';
import { Controller } from '../common/factories/controllers.factory';

@injectable()
export class UsersController extends Controller {
  constructor(private readonly rolesService = inject(RolesService)) {
    super();
  }

  routes() {
    // Account changes (profile, email, password, deletion) go through Better Auth at /api/auth/*.
    return this.controller.get('/me', (c) => {
      const user = c.var.user;
      if (!user) return c.json(null);
      const { role: _stored, ...rest } = user;
      return c.json({ ...rest, roles: this.rolesService.rolesOf(user) });
    });
  }
}
