import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EmailTemplate } from '#lib/server/api/mail/interfaces/email-template.interface';
import { EmailChangeNoticeEmail } from '#lib/server/api/mail/templates/email-change-notice.template';
import { EmailChangeRequestEmail } from '#lib/server/api/mail/templates/email-change-request.template';
import { EmailVerificationEmail } from '#lib/server/api/mail/templates/email-verification.template';
import { PasswordChangedEmail } from '#lib/server/api/mail/templates/password-changed.template';
import { PasswordResetLinkEmail } from '#lib/server/api/mail/templates/password-reset-link.template';
import { RecoveryCodesRegeneratedEmail } from '#lib/server/api/mail/templates/recovery-codes-regenerated.template';
import { RecoveryCodesUsedEmail } from '#lib/server/api/mail/templates/recovery-codes-used.template';
import { TwoFactorOtpEmail } from '#lib/server/api/mail/templates/two-factor-otp.template';

const LINK = 'https://adelie.example.com/action?token=abc&next=%2Fhome';

/** Each template with the phrases its plain-text part must carry: what the reader has to see or act on. */
const TEMPLATES: [string, EmailTemplate, string[]][] = [
  ['EmailChangeNoticeEmail', new EmailChangeNoticeEmail('new@example.com'), ['new@example.com', 'contact support']],
  ['EmailChangeRequestEmail', new EmailChangeRequestEmail(LINK), [LINK, 'did not ask for this change']],
  ['EmailVerificationEmail', new EmailVerificationEmail(LINK), [LINK, 'did not create an account']],
  ['PasswordChangedEmail', new PasswordChangedEmail(), ['password for your account was just changed', 'reset your password']],
  ['PasswordResetLinkEmail', new PasswordResetLinkEmail(LINK), [LINK, 'did not ask for this']],
  ['RecoveryCodesRegeneratedEmail', new RecoveryCodesRegeneratedEmail(), ['old codes no longer work']],
  ['RecoveryCodesUsedEmail', new RecoveryCodesUsedEmail(), ['recovery code was just used', 'Each code works once']],
  ['TwoFactorOtpEmail', new TwoFactorOtpEmail('123456', 5), ['123456', 'valid for 5 minutes', 'did not try to sign in']],
];

describe('email template plain-text parts', () => {
  it.each(TEMPLATES)('%s carries what the reader needs', (_name, template, phrases) => {
    for (const phrase of phrases) expect(template.text()).toContain(phrase);
  });

  it.each(TEMPLATES)('%s has no markup', (_name, template) => {
    expect(template.text()).not.toMatch(/<[a-z/!]/i);
  });

  it('covers every template in the folder', () => {
    const files = readdirSync(new URL('../templates', import.meta.url));
    expect(TEMPLATES).toHaveLength(files.length);
  });
});
