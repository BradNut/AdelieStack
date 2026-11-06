import { StandardEmail } from '#lib/server/api/mail/email-layout';

export class EmailVerificationEmail extends StandardEmail {
  constructor(url: string) {
    super({
      title: 'Verify your email',
      paragraphs: ['Confirm this address to finish setting up your account. If you did not create an account, you can ignore this message.'],
      action: { label: 'Verify email', url: url },
    });
  }
}
