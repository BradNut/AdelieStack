import type { EmailTemplate } from './email-template.interface';

/** Who an email goes to. Logs identify them by `userId`, never `email`; `null` means they have no account. */
export interface MailRecipient {
  email: string;
  userId: string | null;
}

export type SendProps = {
  to: MailRecipient | MailRecipient[];
  template: EmailTemplate;
};

export interface Mailer {
  send: (data: SendProps) => Promise<void>;
}
