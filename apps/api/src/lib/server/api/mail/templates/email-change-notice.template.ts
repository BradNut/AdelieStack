import { type Locale, m } from '#lib/server/api/common/i18n/index';
import { StandardEmail } from '#lib/server/api/mail/email-layout';

export class EmailChangeNoticeEmail extends StandardEmail {
  constructor(newEmail: string, locale: Locale) {
    super({
      locale,
      title: m.mail_email_change_notice_title({}, { locale }),
      paragraphs: [m.mail_email_change_notice_body({ newEmail }, { locale }), m.mail_email_change_notice_warning({}, { locale })],
    });
  }
}
