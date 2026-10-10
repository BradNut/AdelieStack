import { expect, test } from './support/test';

test('home page has expected h1', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});
