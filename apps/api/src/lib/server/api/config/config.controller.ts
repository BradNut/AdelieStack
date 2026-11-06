import { type PublicConfigDto, StatusCodes } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { AuthService } from '#lib/server/api/auth/auth.service';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { Controller } from '#lib/server/api/common/factories/controllers.factory';

/** Public, unauthenticated runtime config for clients. Only non-secret values belong here. */
@injectable()
export class ConfigController extends Controller {
  constructor(
    private readonly configService = inject(ConfigService),
    private readonly authService = inject(AuthService),
  ) {
    super();
  }

  routes() {
    return (
      this.controller
        .get('/', (c) => {
          const body: PublicConfigDto = {
            signUpEnabled: this.configService.envs.SIGN_UP_ENABLED === true,
            socialProviders: this.authService.enabledSocialProviders,
          };
          return c.json(body, StatusCodes.OK);
        })
        // Lets the web learn whether to render a captcha widget, and which, without its own env.
        .get('/captcha', (c) => c.json(this.authService.captchaPublicConfig))
    );
  }
}
