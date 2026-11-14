import { isDevelopmentEnvironment } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import pino from 'pino';
import pretty from 'pino-pretty';
import { ConfigService } from '#lib/server/api/common/configs/config.service';

/** Pretty lines only in development; every other Environment, unset included, writes production's JSON logs. */
export function logDestination(environment: string | undefined): pino.DestinationStream | undefined {
  return isDevelopmentEnvironment(environment) ? pretty() : undefined;
}

@injectable()
export class LoggerService {
  public log: pino.Logger;

  constructor(private configService = inject(ConfigService)) {
    this.log = pino(
      {
        level: this.configService.envs.LOG_LEVEL || 'info',
      },
      logDestination(this.configService.envs.ENVIRONMENT),
    );
  }
}
