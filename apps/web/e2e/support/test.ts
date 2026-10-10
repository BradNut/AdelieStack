import { test as base, expect } from '@playwright/test';

/**
 * `test` with `page.goto` waiting for network idle by default. The forms are client-side, so a
 * click before hydration would submit natively instead of running the Better Auth call.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    page.goto = (url, options) => goto(url, { waitUntil: 'networkidle', ...options });
    await use(page);
  },
});

export { expect };
