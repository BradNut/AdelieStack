import { rateLimit } from '$lib/server/api/common/middleware/rate-limit.middleware';
import { SessionsService } from '$lib/server/api/iam/sessions/sessions.service';
import { UsersService } from '$lib/server/api/users/users.service';
import { zValidator } from '@hono/zod-validator';
import { inject, injectable } from '@needle-di/core';
import { authState } from '../common/middleware/auth.middleware';
import { Controller } from '../common/factories/controllers.factory';
import { signupUsernameEmailDto } from './dtos/signup-username-email.dto';

@injectable()
export class SignupController extends Controller {
  constructor(
    private usersService = inject(UsersService),
    private sessionsService = inject(SessionsService),
  ) {
    super();
  }

  routes() {
		return this.controller
			.post(
				'/',
				authState('none'),
				zValidator('json', signupUsernameEmailDto),
				rateLimit({ limit: 10, minutes: 60 }),
				async (c) => {
					const { email, username, password } = await c.req.valid('json');
					c.var.logger.info(`Signup with email: ${email} username: ${username}`);
					const user = await this.usersService.createWithPassword(username, password, email);

					c.var.logger.info(`Created user: ${user?.id}`);
					if (!user) {
						return c.body('Failed to create user', 500);
					}

					const session = await this.sessionsService.createSession(user.id);
					await this.sessionsService.setSessionCookie(session);
					return c.json({ message: 'ok' });
				}
			);
  }
}
