import { inject, injectable } from '@needle-di/core';
import { contextStorage } from 'hono/context-storage';
import { requestId } from 'hono/request-id';
import { notFound, onError, serveEmojiFavicon } from 'stoker/middlewares';
import { RootController } from './common/factories/controllers.factory';
import { browserSessions } from './common/middleware/browser-session.middleware';
import { requestLocale } from './common/middleware/locale.middleware';
import { otelInstrumentation } from './common/middleware/otel.middleware';
import { pinoLogger } from './common/middleware/pino-logger.middleware';
import { rateLimit } from './common/middleware/rate-limit.middleware';
import { sessionManagement } from './common/middleware/session-managment.middleware';
import { generateId } from './common/utils/crypto';
import configureOpenAPI from './configure-open-api';
import { IamController } from './iam/iam.controller';
import { SignupController } from './signup/signup.controller';
import { UsersController } from './users/users.controller';

@injectable()
export class ApplicationController extends RootController {
  constructor(
    private readonly iamController = inject(IamController),
    private readonly signupController = inject(SignupController),
    private readonly usersController = inject(UsersController),
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
    const app = this.controller
      .basePath('/api')
      .use(otelInstrumentation())
      .use(requestId({ generator: () => generateId() }))
      .use(contextStorage())
      .use(requestLocale)
      .use(browserSessions)
      .use(sessionManagement)
      .use(serveEmojiFavicon('📝'))
      .use(pinoLogger())
      .route('/', this.routes())
      .route('/iam', this.iamController.routes())
      .route('/users', this.usersController.routes())
      .route('/signup', this.signupController.routes())
      .onError(onError)
      .notFound(notFound);

    configureOpenAPI(app);
    return app;
  }
}
