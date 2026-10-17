import { isProdEnv } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import pino from 'pino';
import pretty from 'pino-pretty';
import { ConfigService } from '#lib/server/api/common/configs/config.service';

@injectable()
export class LoggerService {
  public log: pino.Logger;

  constructor(private configService = inject(ConfigService)) {
    this.log = pino(
      {
        level: this.configService.envs.LOG_LEVEL || 'info',
      },
      isProdEnv(this.configService.envs.ENV) ? undefined : pretty(),
    );
  }
}
