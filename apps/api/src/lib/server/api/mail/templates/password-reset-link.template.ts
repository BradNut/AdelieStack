import { StandardEmail } from '#lib/server/api/mail/email-layout';

export class PasswordResetLinkEmail extends StandardEmail {
  constructor(url: string) {
    super({
      title: 'Reset your password',
      paragraphs: [
        'You requested a password reset. Use the link below to choose a new password. If you did not ask for this, you can ignore this message.',
      ],
      action: { label: 'Reset password', url: url },
    });
  }
}
