import { type Locale, m } from '#lib/server/api/common/i18n/index';
import { StandardEmail } from '#lib/server/api/mail/email-layout';

export class TwoFactorOtpEmail extends StandardEmail {
  constructor(otp: string, validForMinutes: number, locale: Locale) {
    super({
      locale,
      title: m.mail_two_factor_otp_title({}, { locale }),
      paragraphs: [m.mail_two_factor_otp_body({}, { locale })],
      code: {
        label: m.mail_two_factor_otp_code_label({}, { locale }),
        value: otp,
        note: m.mail_two_factor_otp_code_note({ minutes: validForMinutes }, { locale }),
      },
    });
  }
}
