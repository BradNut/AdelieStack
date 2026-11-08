import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { StandardEmail } from '#lib/server/api/mail/email-layout';
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

const MARKUP = `<b>o'neil&co</b>`;
const MARKUP_ESCAPED = '&lt;b&gt;o&#39;neil&amp;co&lt;/b&gt;';
const MARKUP_URL = `https://adelie.example.com/action?next=${MARKUP}`;

/** Every template that inserts a dynamic value, given that value with characters HTML treats as markup. */
const TEMPLATES_WITH_MARKUP: [string, EmailTemplate][] = [
  ['EmailChangeNoticeEmail', new EmailChangeNoticeEmail(MARKUP)],
  ['EmailChangeRequestEmail', new EmailChangeRequestEmail(MARKUP_URL)],
  ['EmailVerificationEmail', new EmailVerificationEmail(MARKUP_URL)],
  ['PasswordResetLinkEmail', new PasswordResetLinkEmail(MARKUP_URL)],
  ['TwoFactorOtpEmail', new TwoFactorOtpEmail(MARKUP, 5)],
];

describe('dynamic values', () => {
  it.each(TEMPLATES_WITH_MARKUP)('%s escapes the value in HTML', (_name, template) => {
    expect(template.html()).toContain(MARKUP_ESCAPED);
    expect(template.html()).not.toContain(MARKUP);
  });

  it.each(TEMPLATES_WITH_MARKUP)('%s leaves the value raw in text', (_name, template) => {
    expect(template.text()).toContain(MARKUP);
    expect(template.text()).not.toContain(MARKUP_ESCAPED);
  });

  it('keeps a link with an ampersand valid in HTML and usable in text', () => {
    const template = new EmailVerificationEmail(LINK);

    expect(template.html()).toContain("href='https://adelie.example.com/action?token=abc&amp;next=%2Fhome'");
    expect(template.text()).toContain(LINK);
  });
});

describe('the standard email layout', () => {
  class MarkupEmail extends StandardEmail {
    constructor() {
      super({
        title: `title ${MARKUP}`,
        paragraphs: [`paragraph ${MARKUP}`],
        code: { label: `label ${MARKUP}`, value: `value ${MARKUP}`, note: `note ${MARKUP}` },
        action: { label: `action ${MARKUP}`, url: `https://adelie.example.com/?a=${MARKUP}` },
      });
    }
  }

  it.each(['title', 'paragraph', 'label', 'value', 'note', 'action'])('escapes the %s in HTML', (part) => {
    expect(new MarkupEmail().html()).toContain(`${part} ${MARKUP_ESCAPED}`);
  });

  it('escapes every inserted value, so no raw markup survives', () => {
    expect(new MarkupEmail().html()).not.toContain(MARKUP);
  });

  it('uses the escaped title as the document title', () => {
    expect(new MarkupEmail().html()).toContain(`<title>title ${MARKUP_ESCAPED}</title>`);
  });

  it('leaves the subject and the text part raw', () => {
    const email = new MarkupEmail();

    expect(email.subject()).toBe(`title ${MARKUP}`);
    for (const value of ['title', 'paragraph', 'label', 'value', 'note', 'action']) expect(email.text()).toContain(`${value} ${MARKUP}`);
  });

  it('renders no code block or action when the email has none', () => {
    const html = new PasswordChangedEmail().html();

    expect(html).not.toContain('token-');
    expect(html).not.toContain('<a ');
  });
});

describe('TwoFactorOtpEmail', () => {
  const email = new TwoFactorOtpEmail('123456', 5);

  it('keeps its subject and states the title as the document title', () => {
    expect(email.subject()).toBe('Your sign-in code');
    expect(email.html()).toContain('<title>Your sign-in code</title>');
  });

  it('shows the code, label and validity note in both parts', () => {
    for (const part of [email.html(), email.text()]) {
      expect(part).toContain('123456');
      expect(part).toContain('Verification code');
      expect(part).toContain('(This code is valid for 5 minutes)');
    }
  });

  it('has one spelling of the code label', () => {
    expect(email.html()).not.toContain('Verification Code');
    expect(email.text()).not.toContain('Verification Code');
  });

  it('pairs the label with the code in the text part', () => {
    expect(email.text()).toContain('Verification code: 123456');
  });
});
