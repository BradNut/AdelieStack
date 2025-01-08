import { inject, injectable } from '@needle-di/core';
import { UsersService } from './users.service';
import { Controller } from '../common/factories/controllers.factory';
import { authState } from '../common/middleware/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { updateUserDto } from './dtos/update-user.dto';
import { EmailChangeRequestsService } from './email-change-requests/email-change-requests.service';
import { updateEmailDto } from '$lib/dtos/settings/email/update-email.dto';
import { UsersRepository } from './users.repository';
import { verifyEmailDto } from '$lib/dtos/settings/email/verify-email.dto';
import { rateLimit } from '../common/middleware/rate-limit.middleware';
import { changePasswordDto } from '$lib/dtos/settings/password/change-password.dto';
import { StatusCodes } from '$lib/constants/status-codes';
import { SessionsService } from '../iam/sessions/sessions.service';
import { updateProfileDto } from '$lib/dtos/settings/profile/update-profile.dto';

@injectable()
export class UsersController extends Controller {
  constructor(
    private usersService = inject(UsersService),
    private emailChangeRequestsService = inject(EmailChangeRequestsService),
    private sessionsService = inject(SessionsService),
    private usersRepository = inject(UsersRepository),
  ) {
    super();
  }

  routes() {
    return this.controller
      .get('/me', async (c) => {
        const session = c.var.session;
        const user = session ? await this.usersRepository.findOneByIdOrThrow(session.userId) : null;
        c.var.logger.info(`Get user: ${JSON.stringify(user)}`);
        return c.json(user);
      })
      .patch('/me', authState('session'), zValidator('form', updateUserDto), async (c) => {
        await this.usersService.update(c.var.session.userId, c.req.valid('form'));
        const user = await this.usersRepository.findOneByIdOrThrow(c.var.session.id);
        return c.json(user);
      })
      .post('/me/email/request', authState('session'), zValidator('json', updateEmailDto), rateLimit({ limit: 5, minutes: 15 }), async (c) => {
        c.var.logger.info(`Request email change: ${c.req.valid('json').email}`);
        await this.emailChangeRequestsService.requestEmailChange(c.var.session.userId, c.req.valid('json').email);
        return c.json({ message: 'Email change request sent' });
      })
      .post('/me/email/verify', authState('session'), zValidator('json', verifyEmailDto), rateLimit({ limit: 5, minutes: 15 }), async (c) => {
        await this.emailChangeRequestsService.verifyEmailChange(c.var.session.userId, c.req.valid('json').code);
        return c.json({ message: 'Email change request sent' });
      })
      .put('/me/password', authState('session'), zValidator('json', changePasswordDto), rateLimit({ limit: 5, minutes: 15 }), async (c) => {
        const { current_password, new_password, confirm_password } = c.req.valid('json');
				c.var.logger.debug(`Update password: ${current_password} ${new_password} ${confirm_password}`);
        if (new_password !== confirm_password) {
					c.var.logger.error(`Password mismatch: ${new_password} !== ${confirm_password}`);
          return c.json({ error: 'Passwords do not match' }, StatusCodes.UNPROCESSABLE_ENTITY);
        }
        try {
          const correctPassword = await this.usersService.verifyPassword(c.var.session.userId, { password: current_password });
          if (!correctPassword) {
						c.var.logger.error('Incorrect password');
            return c.json({ error: 'Unable to update password' }, StatusCodes.UNAUTHORIZED);
          }
          await this.usersService.updatePassword(c.var.session.userId, new_password);
          await this.sessionsService.invalidateSession('');
          this.sessionsService.deleteSessionCookie();
          return c.json({ message: 'logout' });
        } catch (error) {
          console.error('Error updating password', error);
          return c.json({ error: 'Unable to update password' }, StatusCodes.INTERNAL_SERVER_ERROR);
        }
      })
      .put('/me/profile', authState('session'), zValidator('json', updateProfileDto), async (c) => {
        await this.usersService.update(c.var.session.userId, c.req.valid('json'));
        const user = await this.usersRepository.findOneByIdOrThrow(c.var.session.userId);
        return c.json(user);
      })
      .delete('/me', authState('session'), async (c) => {
        await this.usersService.delete(c.var.session.userId);
        await this.sessionsService.invalidateSession('');
        this.sessionsService.deleteSessionCookie();
        return c.json({ message: 'User deleted' });
      });
  }
}
