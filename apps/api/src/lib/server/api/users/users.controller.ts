import { injectable } from '@needle-di/core';
import { Controller } from '../common/factories/controllers.factory';

@injectable()
export class UsersController extends Controller {
  routes() {
    // Account changes (profile, email, password, deletion) go through Better Auth at /api/auth/*.
    return this.controller.get('/me', (c) => c.json(c.var.user));
  }
}
