import { resetPasswordCodeDto, resetPasswordEmailDto } from '$lib/dtos/reset-password';
import { zValidator } from '@hono/zod-validator';
import { inject, injectable } from '@needle-di/core';
import { openApi } from 'hono-zod-openapi';
import { createLoginRequestDto } from '../../../dtos/login/create-login-request.dto';
import { loginRequestDto } from '../../../dtos/login/login-request.dto';
import { signinDto } from '../../../dtos/login/signin.dto';
import { verifyLoginRequestDto } from '../../../dtos/login/verify-login-request.dto';
import { Controller } from '../common/factories/controllers.factory';
import { authState } from '../common/middleware/auth.middleware';
import { rateLimit } from '../common/middleware/rate-limit.middleware';
import { LoggerService } from '../common/services/logger.service';
import { LoginRequestsService } from '../iam/login-requests/login-requests.service';
import { SessionsService } from '../iam/sessions/sessions.service';
import { signInEmail } from './login-requests/routes/login.routes';
import { ResetPasswordRequestsService } from './reset-password-requests/reset-password-requests.service';
import { resetPasswordNewPasswordDto } from '$lib/dtos/reset-password/reset-password-new-password.dto';

@injectable()
export class IamController extends Controller {
  constructor(
    private loggerService = inject(LoggerService),
    private loginRequestsService = inject(LoginRequestsService),
    private resetPasswordRequestsService = inject(ResetPasswordRequestsService),
    private sessionsService = inject(SessionsService),
  ) {
    super();
  }

  routes() {
    return this.controller
      .post('/login', openApi(signInEmail), authState('none'), zValidator('json', signinDto), rateLimit({ limit: 3, minutes: 1 }), async (c) => {
        this.loggerService.log.info(`Login with identifier: ${c.req.valid('json').identifier}`);
        const session = await this.loginRequestsService.login(c.req.valid('json'));
        await this.sessionsService.setSessionCookie(session);
        return c.json({ message: 'welcome' });
      })
      .post('/login/request', authState('none'), zValidator('json', createLoginRequestDto), async (c) => {
        await this.loginRequestsService.sendVerificationCode(c.req.valid('json'));
        return c.json({ message: 'welcome' });
      })
      .post('/login/verify', authState('none'), zValidator('json', verifyLoginRequestDto), async (c) => {
        const session = await this.loginRequestsService.verify(c.req.valid('json'));
        await this.sessionsService.setSessionCookie(session);
        return c.json({ message: 'welcome' });
      })
      .post('/logout', async (c) => {
        await this.sessionsService.invalidateSession('');
        this.sessionsService.deleteSessionCookie();
        return c.json({ message: 'logout' });
      })
      .post("/password/reset", authState('none'), zValidator('json', resetPasswordNewPasswordDto), async (c) => {
        await this.resetPasswordRequestsService.resetPassword(c.req.valid('json'));
        return c.json({ message: 'welcome' });
      })
      .post('/password/reset/request', authState('none'), zValidator('json', resetPasswordEmailDto), async (c) => {
        await this.resetPasswordRequestsService.sendResetPasswordCode(c.req.valid('json'));
        return c.json({ message: 'success' });
      })
      .post('/password/reset/verify', authState('none'), zValidator('json', resetPasswordCodeDto), async (c) => {
        await this.resetPasswordRequestsService.verify(c.req.valid('json'));
        return c.json({ message: 'success' });
      });
  }
}
