import { expect } from '@playwright/test';

export const MAILPIT_URL = 'http://localhost:8025';

interface MailpitMessage {
  ID: string;
  Subject: string;
}

/** Polls Mailpit until a message to `to` whose subject contains `subject` arrives; returns its HTML. */
export async function waitForEmail(to: string, subject: string): Promise<string> {
  let html = '';
  await expect
    .poll(
      async () => {
        const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        const { messages } = (await search.json()) as { messages: MailpitMessage[] };
        const match = messages.find((m) => m.Subject.includes(subject));
        if (!match) return false;
        const message = await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`);
        html = ((await message.json()) as { HTML: string }).HTML;
        return true;
      },
      { message: `an email "${subject}" to ${to}`, timeout: 15_000 },
    )
    .toBe(true);
  return html;
}

/** Counts messages to `to` whose subject contains `subject`. */
export async function countEmails(to: string, subject: string): Promise<number> {
  const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  const { messages } = (await search.json()) as { messages: MailpitMessage[] };
  return messages.filter((m) => m.Subject.includes(subject)).length;
}

/** The first `href` in an email's HTML, with HTML entities decoded. */
export function firstLink(html: string): string {
  const href = /href=["']([^"']+)["']/.exec(html)?.[1];
  if (!href) throw new Error('No link found in email');
  return href.replaceAll('&amp;', '&');
}
