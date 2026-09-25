import { inject, injectable } from '@needle-di/core';
import { ConfigService } from '../common/configs/config.service';
import { DevMailerService } from './dev-mailer.service';
import type { Mailer, SendProps } from './interfaces/mailer.interface';
import { ProdMailerService } from './prod-mailer.service';

@injectable()
export class MailerService implements Mailer {
  private mailer: Mailer;
  constructor(
    private configService = inject(ConfigService),
    private prodMailer = inject(ProdMailerService),
    private devMailer = inject(DevMailerService),
  ) {
    this.mailer = this.configService.envs.ENV === 'prod' ? this.prodMailer : this.devMailer;
  }

  async send(data: SendProps) {
    await this.mailer.send(data);
  }
}
