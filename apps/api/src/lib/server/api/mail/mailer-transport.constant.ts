/**
 * Selectable mail transports. `mailpit` posts to the local Mailpit inbox for development;
 * `unsend` is the real production sender. Chosen via the `MAILER_TRANSPORT` env var.
 */
export const MailerTransport = {
  MAILPIT: 'mailpit',
  UNSEND: 'unsend',
} as const;

export type MailerTransportType = (typeof MailerTransport)[keyof typeof MailerTransport];
