import { inject, injectable } from '@needle-di/core';
import { ConfigService } from '../../common/configs/config.service';
import pino from "pino";
import pretty from "pino-pretty";

@injectable()
export class LoggerService {
	public log: pino.Logger;

	constructor(private configService = inject(ConfigService)) {
		this.log = pino(
			{
				level: this.configService.envs.LOG_LEVEL || "info",
			},
			this.configService.envs.ENV === 'prod' ? undefined : pretty(),
		);
	}
}
