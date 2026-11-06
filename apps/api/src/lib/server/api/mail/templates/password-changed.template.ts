import { StandardEmail } from '#lib/server/api/mail/email-layout';

export class PasswordChangedEmail extends StandardEmail {
  constructor() {
    super({
      title: 'Your password was changed',
      paragraphs: [
        'The password for your account was just changed. If this was not you, reset your password and review your account security straight away.',
      ],
    });
  }
}
