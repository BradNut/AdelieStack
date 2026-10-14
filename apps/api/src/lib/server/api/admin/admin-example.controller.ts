import { inject, injectable } from '@needle-di/core';
import { AuthService } from '#lib/server/api/auth/auth.service';
import { RolesService } from '#lib/server/api/auth/roles';
import { Controller } from '#lib/server/api/common/factories/controllers.factory';
import { requirePermission } from '#lib/server/api/common/middleware/permission.middleware';

/**
 * Pattern for forks: guard a route with the permission it needs, not a role name. Which roles
 * hold `user:list` is decided in `auth/auth.permissions.ts`.
 */
@injectable()
export class AdminExampleController extends Controller {
  constructor(
    private readonly authService = inject(AuthService),
    private readonly rolesService = inject(RolesService),
  ) {
    super();
  }

  routes() {
    return this.controller.get('/example', requirePermission(this.authService, this.rolesService, { user: ['list'] }), (c) =>
      c.json({ message: 'admin' }),
    );
  }
}
