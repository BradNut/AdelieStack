import { type Locale, m } from '#lib/server/api/common/i18n/index';
import { StandardEmail } from '#lib/server/api/mail/email-layout';

export class PasswordResetLinkEmail extends StandardEmail {
  constructor(url: string, locale: Locale) {
    super({
      locale,
      title: m.mail_password_reset_title({}, { locale }),
      paragraphs: [m.mail_password_reset_body({}, { locale })],
      action: { label: m.mail_password_reset_action({}, { locale }), url },
    });
  }
}
