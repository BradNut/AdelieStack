import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { baseLocale, type Locale, locales } from '#lib/server/api/common/i18n/index';
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
  [
    'EmailChangeNoticeEmail',
    new EmailChangeNoticeEmail('new@example.com', 'en'),
    [
      'Your email address was changed',
      'The email for your account is now new@example.com. This address no longer receives account email.',
      'contact support',
    ],
  ],
  [
    'EmailChangeRequestEmail',
    new EmailChangeRequestEmail(LINK, 'en'),
    ['Confirm your new email address', 'Confirm email change', LINK, 'did not ask for this change'],
  ],
  ['EmailVerificationEmail', new EmailVerificationEmail(LINK, 'en'), ['Verify your email', 'Verify email', LINK, 'did not create an account']],
  [
    'PasswordChangedEmail',
    new PasswordChangedEmail('en'),
    ['Your password was changed', 'password for your account was just changed', 'reset your password'],
  ],
  ['PasswordResetLinkEmail', new PasswordResetLinkEmail(LINK, 'en'), ['Reset your password', 'Reset password', LINK, 'did not ask for this']],
  ['RecoveryCodesRegeneratedEmail', new RecoveryCodesRegeneratedEmail('en'), ['Your recovery codes were regenerated', 'old codes no longer work']],
  ['RecoveryCodesUsedEmail', new RecoveryCodesUsedEmail('en'), ['A recovery code was used', 'recovery code was just used', 'Each code works once']],
  [
    'TwoFactorOtpEmail',
    new TwoFactorOtpEmail('123456', 5, 'en'),
    ['Your sign-in code', 'Verification code', '123456', 'valid for 5 minutes', 'did not try to sign in'],
  ],
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
  ['EmailChangeNoticeEmail', new EmailChangeNoticeEmail(MARKUP, 'en')],
  ['EmailChangeRequestEmail', new EmailChangeRequestEmail(MARKUP_URL, 'en')],
  ['EmailVerificationEmail', new EmailVerificationEmail(MARKUP_URL, 'en')],
  ['PasswordResetLinkEmail', new PasswordResetLinkEmail(MARKUP_URL, 'en')],
  ['TwoFactorOtpEmail', new TwoFactorOtpEmail(MARKUP, 5, 'en')],
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
    const template = new EmailVerificationEmail(LINK, 'en');

    expect(template.html()).toContain("href='https://adelie.example.com/action?token=abc&amp;next=%2Fhome'");
    expect(template.text()).toContain(LINK);
  });
});

describe('the standard email layout', () => {
  class MarkupEmail extends StandardEmail {
    constructor() {
      super({
        locale: 'en',
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
    const html = new PasswordChangedEmail('en').html();

    expect(html).not.toContain('token-');
    expect(html).not.toContain('<a ');
  });
});

describe('TwoFactorOtpEmail', () => {
  const email = new TwoFactorOtpEmail('123456', 5, 'en');

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

  it('states the validity period it is given', () => {
    expect(new TwoFactorOtpEmail('123456', 37, 'en').text()).toContain('(This code is valid for 37 minutes)');
  });

  it.each(locales)('interpolates the validity period in both parts in %s', (locale) => {
    for (const minutes of [5, 37]) {
      const localised = new TwoFactorOtpEmail('123456', minutes, locale);
      const period = new RegExp(`\\b${minutes}\\b`);

      expect(localised.text()).toMatch(period);
      expect(localised.html().match(/token-subtext'>([^<]*)</)?.[1]).toMatch(period);
    }
  });
});

/** Each localised template, with the dynamic values it is built with. */
const LOCALISED_TEMPLATES: [string, (locale: Locale) => EmailTemplate, string[]][] = [
  ['EmailChangeNoticeEmail', (locale) => new EmailChangeNoticeEmail('new@example.com', locale), ['new@example.com']],
  ['EmailChangeRequestEmail', (locale) => new EmailChangeRequestEmail(LINK, locale), [LINK]],
  ['EmailVerificationEmail', (locale) => new EmailVerificationEmail(LINK, locale), [LINK]],
  ['PasswordChangedEmail', (locale) => new PasswordChangedEmail(locale), []],
  ['PasswordResetLinkEmail', (locale) => new PasswordResetLinkEmail(LINK, locale), [LINK]],
  ['RecoveryCodesRegeneratedEmail', (locale) => new RecoveryCodesRegeneratedEmail(locale), []],
  ['RecoveryCodesUsedEmail', (locale) => new RecoveryCodesUsedEmail(locale), []],
  ['TwoFactorOtpEmail', (locale) => new TwoFactorOtpEmail('123456', 5, locale), ['123456']],
];

const TRANSLATED_LOCALES = locales.filter((locale) => locale !== baseLocale);

describe.each(LOCALISED_TEMPLATES)('%s in every locale', (_name, build, dynamicValues) => {
  it.each(locales)('marks the HTML as %s', (locale) => {
    expect(build(locale).html()).toContain(`<html lang='${locale}'>`);
  });

  it.each(locales)('states the title in the subject, HTML and text in %s', (locale) => {
    const email = build(locale);

    expect(email.html()).toContain(`<title>${email.subject()}</title>`);
    expect(email.html()).toContain(`<p class='title'>${email.subject()}</p>`);
    expect(email.text().startsWith(email.subject())).toBe(true);
  });

  it.each(locales)('carries its dynamic values in both parts in %s', (locale) => {
    const email = build(locale);

    for (const value of dynamicValues) {
      expect(email.text()).toContain(value);
      expect(email.html()).toContain(value.replaceAll('&', '&amp;'));
    }
  });

  it.each(TRANSLATED_LOCALES)('is translated in %s', (locale) => {
    const english = build(baseLocale);
    const translated = build(locale);

    expect(translated.subject()).not.toBe(english.subject());
    // Differs apart from the values that are the same in every language.
    const prose = (text: string) => dynamicValues.reduce((rest, value) => rest.replaceAll(value, ''), text);
    for (const line of prose(english.text()).split('\n').filter(Boolean)) expect(prose(translated.text())).not.toContain(line);
  });
});

describe('PasswordChangedEmail English copy', () => {
  it('keeps its wording', () => {
    const email = new PasswordChangedEmail('en');

    expect(email.subject()).toBe('Your password was changed');
    expect(email.text()).toContain(
      'The password for your account was just changed. If this was not you, reset your password and review your account security straight away.',
    );
  });
});
