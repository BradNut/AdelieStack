import { inject, injectable } from '@needle-di/core';
import { UseSend } from 'usesend-js';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { LoggerService } from '#lib/server/api/common/services/logger.service';
import { publicId } from '#lib/server/api/common/utils/crypto';
import type { Mailer, SendProps } from './interfaces/mailer.interface';

const MAX_SEND_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 250;
const UNKNOWN_SEND_ERROR = 'unknown useSend error';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * `code: message` from the `error` that `emails.send()` resolves with. Its type says `{ code, message }`, but the
 * library passes useSend's standard error body on whole, as `{ error: { code, message } }`, and a non-standard body's
 * `error` as is, which can be a bare string.
 */
function describeReturnedError(returned: unknown): string {
  const error = isRecord(returned) && 'error' in returned ? returned.error : returned;
  if (typeof error === 'string') return error;
  if (!isRecord(error)) return UNKNOWN_SEND_ERROR;
  return [error.code, error.message].filter((part) => typeof part === 'string').join(': ') || UNKNOWN_SEND_ERROR;
}

/**
 * Sends through useSend, one email per recipient. The env schema requires the key and sender whenever this transport
 * is selected; the client opens on first send, so another transport never reads them.
 */
@injectable()
export class UseSendMailerService implements Mailer {
  private client?: UseSend;

  constructor(
    private readonly configService = inject(ConfigService),
    private readonly logger = inject(LoggerService),
  ) {}

  async send({ to, template }: SendProps) {
    const recipients = Array.isArray(to) ? to : [to];
    if (recipients.length === 0) {
      this.logger.log.warn('Skipping useSend email: no recipients');
      return;
    }

    const from = this.configService.envs.MAIL_FROM as string;
    const content = { from, subject: template.subject(), html: template.html(), text: template.text() };
    for (const recipient of recipients) {
      await this.sendWithRetry({ ...content, to: recipient });
    }
  }

  /** Every failure is retried: the library hides the HTTP status. The key stops a retry from sending a second copy. */
  private async sendWithRetry(payload: Parameters<UseSend['emails']['send']>[0] & { to: string }) {
    const idempotencyKey = publicId();
    for (let attempt = 1; ; attempt++) {
      try {
        const { error } = await this.getClient().emails.send(payload, { idempotencyKey });
        // A refused send resolves rather than throws.
        if (error !== null) throw new Error(describeReturnedError(error));
        this.logger.log.info({ to: payload.to, attempt }, 'useSend email sent');
        return;
      } catch (err) {
        this.logger.log.warn({ to: payload.to, attempt, error: err instanceof Error ? err.message : String(err) }, 'useSend email failed');
        if (attempt === MAX_SEND_ATTEMPTS) throw err;
        await wait(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }

  private getClient() {
    const { USESEND_API_KEY, USESEND_BASE_URL } = this.configService.envs;
    this.client ??= new UseSend(USESEND_API_KEY, USESEND_BASE_URL);
    return this.client;
  }
}
