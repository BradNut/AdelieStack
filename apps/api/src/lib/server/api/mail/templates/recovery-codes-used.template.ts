import { type Locale, m } from '#lib/server/api/common/i18n/index';
import { StandardEmail } from '#lib/server/api/mail/email-layout';

export class RecoveryCodesUsedEmail extends StandardEmail {
  constructor(locale: Locale) {
    super({
      locale,
      title: m.mail_recovery_codes_used_title({}, { locale }),
      paragraphs: [m.mail_recovery_codes_used_body({}, { locale })],
    });
  }
}
