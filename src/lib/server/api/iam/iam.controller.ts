import { inject, injectable } from '@needle-di/core';
import { zValidator } from '@hono/zod-validator';
import { openApi } from 'hono-zod-openapi';
import { createLoginRequestDto } from '../../../dtos/login/create-login-request.dto';
import { LoginRequestsService } from '../iam/login-requests/login-requests.service';
import { verifyLoginRequestDto } from '../../../dtos/login/verify-login-request.dto';
import { SessionsService } from '../iam/sessions/sessions.service';
import { authState } from '../common/middleware/auth.middleware';
import { Controller } from '../common/factories/controllers.factory';
import { loginRequestDto } from '../../../dtos/login/login-request.dto';
import { signInEmail } from './login-requests/routes/login.routes';
import { rateLimit } from '../common/middleware/rate-limit.middleware';
import { LoggerService } from '../common/services/logger.service';
import { signinDto } from '../../../dtos/login/signin.dto';

@injectable()
export class IamController extends Controller {
  constructor(
    private loggerService = inject(LoggerService),
    private loginRequestsService = inject(LoginRequestsService),
    private sessionsService = inject(SessionsService),
  ) {
    super();
  }

  routes() {
    return this.controller
      .post('/login', openApi(signInEmail), authState('none'), zValidator('json', signinDto), rateLimit({ limit: 3, minutes: 1 }), async (c) => {
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
      });
  }
}
