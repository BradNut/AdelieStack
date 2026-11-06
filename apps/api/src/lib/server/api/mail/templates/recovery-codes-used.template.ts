import { StandardEmail } from '#lib/server/api/mail/email-layout';

export class RecoveryCodesUsedEmail extends StandardEmail {
  constructor() {
    super({
      title: 'A recovery code was used',
      paragraphs: [
        'A two-factor recovery code was just used to sign in to your account. Each code works once. If this was not you, secure your account straight away.',
      ],
    });
  }
}
