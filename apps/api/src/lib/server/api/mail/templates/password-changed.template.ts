import { type Locale, m } from '#lib/server/api/common/i18n/index';
import { StandardEmail } from '#lib/server/api/mail/email-layout';

export class PasswordChangedEmail extends StandardEmail {
  constructor(locale: Locale) {
    super({
      locale,
      title: m.mail_password_changed_title({}, { locale }),
      paragraphs: [m.mail_password_changed_body({}, { locale })],
    });
  }
}
