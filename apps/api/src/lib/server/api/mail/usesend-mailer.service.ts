import { inject, injectable } from '@needle-di/core';
import { UseSend } from 'usesend-js';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { LoggerService } from '#lib/server/api/common/services/logger.service';
import { publicId } from '#lib/server/api/common/utils/crypto';
import { isRecord } from '#lib/server/api/common/utils/is-record';
import type { Mailer, SendProps } from './interfaces/mailer.interface';

const MAX_SEND_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 250;
const UNKNOWN_SEND_ERROR = 'unknown useSend error';
/**
 * Always passed to the client. Left to itself the library reads `USESEND_BASE_URL` from `process.env` at import and
 * keeps an empty string as its address, so every send would go to the relative `/api/v1`.
 */
const USESEND_DEFAULT_BASE_URL = 'https://app.usesend.com';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  async send({ to, template }: SendProps): Promise<void> {
    const recipients = Array.isArray(to) ? to : [to];
    if (recipients.length === 0) {
      this.logger.log.warn('Skipping useSend email: no recipients');
      return;
    }

    const from = this.configService.envs.MAIL_FROM as string;
    const content = { from, subject: template.subject(), html: template.html(), text: template.text() };
    // One recipient's failure must not cost the others their email; each failure is already logged per attempt.
    const failures: unknown[] = [];
    for (const recipient of recipients) {
      try {
        await this.sendWithRetry({ ...content, to: recipient });
      } catch (err) {
        failures.push(err);
      }
    }
    if (failures.length > 0) throw failures[0];
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
    this.client ??= new UseSend(USESEND_API_KEY, USESEND_BASE_URL ?? USESEND_DEFAULT_BASE_URL);
    return this.client;
  }
}
