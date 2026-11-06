import type { EmailTemplate } from '#lib/server/api/mail/interfaces/email-template.interface';

/** The HTML document around every email's body. `bodyLines` and `style` are inserted as they are. */
export function renderEmailDocument(bodyLines: string[], style: string): string {
  return /*html*/ `
		<html lang='en'>
			<head>
				<meta http-equiv='X-UA-Compatible' content='IE=edge' />
				<meta name='viewport' content='width=device-width, initial-scale=1.0' />
				<title>Message</title>
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
  /** Both the subject and the heading. */
  title: string;
  paragraphs: string[];
  /** A link in the HTML, `label: url` in the text. */
  action?: { label: string; url: string };
}

/** An email of a title, paragraphs and at most one link, stated once and rendered as subject, HTML and text. */
export abstract class StandardEmail implements EmailTemplate {
  constructor(private readonly content: EmailContent) {}

  subject(): string {
    return this.content.title;
  }

  html(): string {
    const { title, paragraphs, action } = this.content;
    return renderEmailDocument(
      [
        `<p class='title'>${title}</p>`,
        ...paragraphs.map((paragraph) => `<p>${paragraph}</p>`),
        ...(action ? [`<p><a href='${action.url}'>${action.label}</a></p>`] : []),
      ],
      '.title { font-size: 24px; font-weight: 700; }',
    );
  }

  text(): string {
    const { title, paragraphs, action } = this.content;
    return [title, ...paragraphs, ...(action ? [`${action.label}: ${action.url}`] : [])].join('\n\n');
  }
}
