// MFA controller stubbed - full implementation requires missing services (TotpService, RecoveryCodesService, auth middleware)

import { StatusCodes } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { Controller } from '../common/factories/controllers.factory';
import { UsersService } from '../users/users.service';

@injectable()
export class MfaController extends Controller {
  constructor(private readonly usersService = inject(UsersService)) {
    super();
  }

  routes() {
    return this.controller.get('/totp', async (c) => {
      // MFA not implemented yet
      return c.json({ message: 'MFA not implemented' }, StatusCodes.NOT_IMPLEMENTED);
    });
  }
}
