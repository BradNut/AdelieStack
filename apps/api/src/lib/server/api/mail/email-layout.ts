import { baseLocale, type Locale } from '#lib/server/api/common/i18n/index';
import type { EmailTemplate } from '#lib/server/api/mail/interfaces/email-template.interface';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

interface EmailDocument {
  /** The language the document is marked with. */
  lang: Locale;
  /** Plain text; escaped here. */
  title: string;
  /** Inserted as they are, so the caller escapes what they carry. */
  bodyLines: string[];
  /** Inserted as it is. */
  style: string;
}

/** The HTML document around every email's body. */
export function renderEmailDocument({ lang, title, bodyLines, style }: EmailDocument): string {
  return /*html*/ `
		<html lang='${lang}'>
			<head>
				<meta http-equiv='X-UA-Compatible' content='IE=edge' />
				<meta name='viewport' content='width=device-width, initial-scale=1.0' />
				<title>${escapeHtml(title)}</title>
			</head>
			<body>
				${bodyLines.join('\n\t\t\t\t')}
			</body>
			<style>
				${style}
			</style>
		</html>
		`;
}

interface EmailContent {
  /** The language the copy is in; marks the HTML. */
  locale?: Locale;
  /** Both the subject and the heading. */
  title: string;
  paragraphs: string[];
  /** A value to read off the email, such as a sign-in code. */
  code?: { label: string; value: string; note: string };
  /** A link in the HTML, `label: url` in the text. */
  action?: { label: string; url: string };
}

const TITLE_STYLE = '.title { font-size: 24px; font-weight: 700; }';
const CODE_STYLE = `.token-text { font-size: 24px; font-weight: 700;
				margin-top: 8px; } .token-title { font-size: 18px; font-weight: 700; margin-bottom: 0px; }
				.center { display: flex; justify-content: center; align-items: center; flex-direction: column;}
				.token-subtext { font-size: 12px; margin-top: 0px; }`;

/** An email of a title, paragraphs, and at most one code and one link, stated once and rendered as subject, HTML and text. */
export abstract class StandardEmail implements EmailTemplate {
  constructor(private readonly content: EmailContent) {}

  subject(): string {
    return this.content.title;
  }

  html(): string {
    const { locale = baseLocale, title, paragraphs, code, action } = this.content;
    return renderEmailDocument({
      lang: locale,
      title,
      bodyLines: [
        `<p class='title'>${escapeHtml(title)}</p>`,
        ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
        ...(code
          ? [
              "<div class='center'>",
              `\t<p class='token-title'>${escapeHtml(code.label)}</p>`,
              `\t<p class='token-text'>${escapeHtml(code.value)}</p>`,
              `\t<p class='token-subtext'>${escapeHtml(code.note)}</p>`,
              '</div>',
            ]
          : []),
        ...(action ? [`<p><a href='${escapeHtml(action.url)}'>${escapeHtml(action.label)}</a></p>`] : []),
      ],
      style: code ? `${TITLE_STYLE} ${CODE_STYLE}` : TITLE_STYLE,
    });
  }

  text(): string {
    const { title, paragraphs, code, action } = this.content;
    return [
      title,
      ...paragraphs,
      ...(code ? [`${code.label}: ${code.value}\n${code.note}`] : []),
      ...(action ? [`${action.label}: ${action.url}`] : []),
    ].join('\n\n');
  }
}
