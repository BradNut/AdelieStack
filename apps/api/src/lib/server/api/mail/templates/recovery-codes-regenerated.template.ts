import { StandardEmail } from '#lib/server/api/mail/email-layout';

export class RecoveryCodesRegeneratedEmail extends StandardEmail {
  constructor() {
    super({
      title: 'Your recovery codes were regenerated',
      paragraphs: [
        'New two-factor recovery codes were generated for your account. Your old codes no longer work. If this was not you, secure your account straight away.',
      ],
    });
  }
}
