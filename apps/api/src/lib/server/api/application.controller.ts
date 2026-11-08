import { API_BASE_PATH, AUTH_ROUTE } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { contextStorage } from 'hono/context-storage';
import { requestId } from 'hono/request-id';
import { pinoLogger } from 'hono-pino';
import { notFound, onError, serveEmojiFavicon } from 'stoker/middlewares';
import { AdminExampleController } from './admin/admin-example.controller';
import { AuthService } from './auth/auth.service';
import { authSession } from './auth/auth-session.middleware';
import { ConfigService } from './common/configs/config.service';
import { RootController } from './common/factories/controllers.factory';
import { browserSessions } from './common/middleware/browser-session.middleware';
import { requestLocale } from './common/middleware/locale.middleware';
import { otelInstrumentation } from './common/middleware/otel.middleware';
import { rateLimit } from './common/middleware/rate-limit.middleware';
import { LoggerService } from './common/services/logger.service';
import { publicId } from './common/utils/crypto';
import { ConfigController } from './config/config.controller';
import configureOpenAPI from './configure-open-api';
import { StorageWebhookController } from './storage/storage-webhook.controller';
import { UsersController } from './users/users.controller';

@injectable()
export class ApplicationController extends RootController {
  constructor(
    private readonly authService = inject(AuthService),
    private readonly usersController = inject(UsersController),
    private readonly storageWebhookController = inject(StorageWebhookController),
    private readonly configController = inject(ConfigController),
    private readonly adminExampleController = inject(AdminExampleController),
    private readonly configService = inject(ConfigService),
    private readonly loggerService = inject(LoggerService),
  ) {
    super();
  }

  routes() {
    return this.controller
      .get('/', (c) => {
        return c.json({ status: 'ok' });
      })
      .get('/healthz', (c) => {
        // HIBP is reported from the last breached-password check; probes never call it, and an outage
        // does not fail liveness (sign-in and the rest of the app still work).
        // Captcha is reported the same way: from the last verification, never by calling the provider.
        return c.json({ status: 'ok', hibp: this.authService.hibpStatus.health, captcha: this.authService.captchaStatus.health });
      })
      .get('/rate-limit', rateLimit({ limit: 3, minutes: 1 }), (c) => {
        return c.json({ message: 'Test!' });
      });
  }

  registerControllers() {
    const api = this.controller
      .basePath(API_BASE_PATH)
      .use(otelInstrumentation())
      .use(requestId({ generator: () => publicId() }))
      .use(contextStorage())
      .use(requestLocale)
      .use(browserSessions(this.configService.envs))
      .use(serveEmojiFavicon('📝'))
      .use(pinoLogger({ pino: this.loggerService.log }));

    // Better Auth owns /api/auth/* with its own request/response shapes. It is registered
    // before the session middleware and every other route, and kept out of the returned
    // chain so it stays outside the api-contract RPC types.
    api.on(['GET', 'POST'], `${AUTH_ROUTE}/*`, (c) => this.authService.auth.handler(c.req.raw));

    const app = api
      .use(authSession(this.authService))
      .route('/', this.routes())
      .route('/config', this.configController.routes())
      .route('/users', this.usersController.routes())
      .route('/admin', this.adminExampleController.routes())
      .route('/storage', this.storageWebhookController.routes())
      .onError(onError)
      .notFound(notFound);

    configureOpenAPI(app);
    return app;
  }
}
