import { inject, injectable } from '@needle-di/core';
import { contextStorage } from 'hono/context-storage';
import { requestId } from 'hono/request-id';
import { notFound, onError, serveEmojiFavicon } from 'stoker/middlewares';
import { AuthService } from './auth/auth.service';
import { RootController } from './common/factories/controllers.factory';
import { authSession } from './common/middleware/auth-session.middleware';
import { browserSessions } from './common/middleware/browser-session.middleware';
import { requestLocale } from './common/middleware/locale.middleware';
import { otelInstrumentation } from './common/middleware/otel.middleware';
import { pinoLogger } from './common/middleware/pino-logger.middleware';
import { rateLimit } from './common/middleware/rate-limit.middleware';
import { generateId } from './common/utils/crypto';
import configureOpenAPI from './configure-open-api';
import { StorageWebhookController } from './storage/storage-webhook.controller';
import { UsersController } from './users/users.controller';

@injectable()
export class ApplicationController extends RootController {
  constructor(
    private readonly authService = inject(AuthService),
    private readonly usersController = inject(UsersController),
    private readonly storageWebhookController = inject(StorageWebhookController),
  ) {
    super();
  }

  routes() {
    return this.controller
      .get('/', (c) => {
        return c.json({ status: 'ok' });
      })
      .get('/healthz', (c) => {
        return c.json({ status: 'ok' });
      })
      .get('/rate-limit', rateLimit({ limit: 3, minutes: 1 }), (c) => {
        return c.json({ message: 'Test!' });
      });
  }

  registerControllers() {
    const api = this.controller
      .basePath('/api')
      .use(otelInstrumentation())
      .use(requestId({ generator: () => generateId() }))
      .use(contextStorage())
      .use(requestLocale)
      .use(browserSessions)
      .use(serveEmojiFavicon('📝'))
      .use(pinoLogger());

    // Better Auth owns /api/auth/* with its own request/response shapes. It is registered
    // before the session middleware and every other route, and kept out of the returned
    // chain so it stays outside the api-contract RPC types.
    api.on(['GET', 'POST'], '/auth/*', (c) => this.authService.auth.handler(c.req.raw));

    const app = api
      .use(authSession(this.authService))
      .route('/', this.routes())
      .route('/users', this.usersController.routes())
      .route('/storage', this.storageWebhookController.routes())
      .onError(onError)
      .notFound(notFound);

    configureOpenAPI(app);
    return app;
  }
}
