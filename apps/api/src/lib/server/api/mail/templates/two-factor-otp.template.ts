import { StandardEmail } from '#lib/server/api/mail/email-layout';

export class TwoFactorOtpEmail extends StandardEmail {
  constructor(otp: string, validForMinutes: number) {
    super({
      title: 'Your sign-in code',
      paragraphs: ['Enter this code to finish signing in. If you did not try to sign in, you can ignore this message.'],
      code: { label: 'Verification code', value: otp, note: `(This code is valid for ${validForMinutes} minutes)` },
    });
  }
}
