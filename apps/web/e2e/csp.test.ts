import type { Page } from '@playwright/test';
import { newUser, signUp } from './support/auth';
import { expect, test } from './support/test';

/** Records every Content-Security-Policy violation the page reports, from first script onward. */
async function trackCspViolations(page: Page) {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) violations.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`Content Security Policy violation: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return violations;
}

test.describe('content security policy', () => {
  test('public pages load with no violations', async ({ page }) => {
    const violations = await trackCspViolations(page);

    for (const path of ['/', '/login', '/signup']) {
      await page.goto(path);
    }

    expect(violations).toEqual([]);
  });

  test('settings load with no violations and the theme script runs', async ({ page }) => {
    const violations = await trackCspViolations(page);

    await signUp(page, newUser());
    await page.goto('/settings/password');

    expect(violations).toEqual([]);
  });

  test('the theme is applied before first paint', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.dataset.darkAtDomReady = String(document.documentElement.classList.contains('dark'));
      });
    });

    await page.goto('/login');

    await expect(page.locator('html')).toHaveAttribute('data-dark-at-dom-ready', 'true');
  });

  test('the inline theme script is allowed by the served policy', async ({ request }) => {
    const response = await request.get('/login');
    const policy = response.headers()['content-security-policy'] ?? '';
    const html = await response.text();
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(([, , body]) => body.trim());

    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attributes] of scripts) {
      const nonce = /nonce="?([^"\s>]+)/.exec(attributes)?.[1];
      expect(nonce, `inline script without a nonce: ${attributes}`).toBeTruthy();
      expect(policy).toContain(`'nonce-${nonce}'`);
    }
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});
