import { Container } from '@needle-di/core';
import { pinoLogger as logger } from 'hono-pino';
import pino from 'pino';
import pretty from 'pino-pretty';
import { ConfigService } from '../configs/config.service';

export function pinoLogger() {
  const container = new Container();
  const configService = container.get(ConfigService);
  return logger({
    pino: pino(
      {
        level: configService.envs.LOG_LEVEL || 'info',
      },
      configService.envs.NODE_ENV === 'production' ? undefined : pretty({ colorize: true }),
    ),
  });
}
