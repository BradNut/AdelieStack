import { StandardEmail } from '#lib/server/api/mail/email-layout';

export class EmailChangeNoticeEmail extends StandardEmail {
  constructor(newEmail: string) {
    super({
      title: 'Your email address was changed',
      paragraphs: [
        `The email for your account is now ${newEmail}. This address no longer receives account email.`,
        'If this was not you, contact support right away and secure your account.',
      ],
    });
  }
}
