import { StandardEmail } from '#lib/server/api/mail/email-layout';

export class EmailChangeRequestEmail extends StandardEmail {
  constructor(url: string) {
    super({
      title: 'Confirm your new email address',
      paragraphs: ['Confirm this address to make it the email for your account. If you did not ask for this change, you can ignore this message.'],
      action: { label: 'Confirm email change', url: url },
    });
  }
}
