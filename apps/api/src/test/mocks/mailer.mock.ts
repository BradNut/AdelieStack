import { vi } from 'vitest';
import type { Mailer, SendProps } from '../../lib/server/api/mail/interfaces/mailer.interface';

/** Records outgoing mail instead of hitting Mailpit or the production provider. */
export function createMailerServiceMock() {
  const sent: SendProps[] = [];
  const send = vi.fn<Mailer['send']>(async (data) => {
    sent.push(data);
  });
  return { send, sent };
}

export type MailerServiceMock = ReturnType<typeof createMailerServiceMock>;
