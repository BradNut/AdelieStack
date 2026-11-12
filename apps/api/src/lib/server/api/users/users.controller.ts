import { inject, injectable } from '@needle-di/core';
import { rolesNeedSecondFactor } from '#lib/server/api/auth/auth.second-factor';
import { AuthService } from '#lib/server/api/auth/auth.service';
import { RolesService } from '#lib/server/api/auth/roles';
import { Controller } from '#lib/server/api/common/factories/controllers.factory';

@injectable()
export class UsersController extends Controller {
  constructor(
    private readonly rolesService = inject(RolesService),
    private readonly authService = inject(AuthService),
  ) {
    super();
  }

  routes() {
    // Account changes (profile, email, password, deletion) go through Better Auth at /api/auth/*.
    return this.controller.get('/me', async (c) => {
      const user = c.var.user;
      if (!user) return c.json(null);
      const { role: _stored, ...rest } = user;
      const roles = this.rolesService.rolesOf(user);
      // The web app sends an admin without a Second Factor to enrolment instead of an error page (ADR 0014).
      const needsSecondFactor = rolesNeedSecondFactor(roles) && !(await this.authService.hasSecondFactor(user));
      return c.json({ ...rest, roles, needsSecondFactor });
    });
  }
}
