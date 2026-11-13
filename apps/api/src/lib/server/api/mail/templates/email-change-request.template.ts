import { type Locale, m } from '#lib/server/api/common/i18n/index';
import { StandardEmail } from '#lib/server/api/mail/email-layout';

export class EmailChangeRequestEmail extends StandardEmail {
  constructor(url: string, locale: Locale) {
    super({
      locale,
      title: m.mail_email_change_request_title({}, { locale }),
      paragraphs: [m.mail_email_change_request_body({}, { locale })],
      action: { label: m.mail_email_change_request_action({}, { locale }), url },
    });
  }
}
