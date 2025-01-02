import { pinoLogger as logger } from "hono-pino";
import { Container } from '@needle-di/core';
import { ConfigService } from '../configs/config.service';
import pino from "pino";
import pretty from "pino-pretty";

export function pinoLogger() {
	const container = new Container();
  const configService = container.get(ConfigService);
	return logger({
		pino: pino(
			{
				level: configService.envs.LOG_LEVEL || "info",
			},
			configService.envs.NODE_ENV === "production" ? undefined : pretty(),
		),
	});
}
