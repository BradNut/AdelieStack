import { renderEmailDocument } from '#lib/server/api/mail/email-layout';
import type { EmailTemplate } from '#lib/server/api/mail/interfaces/email-template.interface';

export class TwoFactorOtpEmail implements EmailTemplate {
  constructor(
    private readonly otp: string,
    private readonly validForMinutes: number,
  ) {}

  subject(): string {
    return 'Your sign-in code';
  }

  html() {
    return renderEmailDocument(
      [
        "<p class='title'>Your sign-in code</p>",
        '<p>Enter this code to finish signing in. If you did not try to sign in, you can ignore this message.</p>',
        "<div class='center'>",
        `\t<p class='token-title'>Verification Code</p>`,
        `\t<p class='token-text'>${this.otp}</p>`,
        `\t<p class='token-subtext'>(This code is valid for ${this.validForMinutes} minutes)</p>`,
        '</div>',
      ],
      `.title { font-size: 24px; font-weight: 700; } .token-text { font-size: 24px; font-weight: 700;
				margin-top: 8px; } .token-title { font-size: 18px; font-weight: 700; margin-bottom: 0px; }
				.center { display: flex; justify-content: center; align-items: center; flex-direction: column;}
				.token-subtext { font-size: 12px; margin-top: 0px; }`,
    );
  }

  text(): string {
    return [
      'Your sign-in code',
      '',
      'Enter this code to finish signing in. If you did not try to sign in, you can ignore this message.',
      '',
      `Verification code: ${this.otp}`,
      `(This code is valid for ${this.validForMinutes} minutes)`,
    ].join('\n');
  }
}
