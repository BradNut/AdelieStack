import { newUser, signUp } from './support/auth';
import { expect, test } from './support/test';

// The e2e API runs without provider credentials, as a fresh install does.
test.describe('with no social provider configured', () => {
  test('the public config reports no providers', async ({ request }) => {
    const res = await request.get('/api/config');

    expect(res.ok()).toBe(true);
    expect(((await res.json()) as { socialProviders: string[] }).socialProviders).toEqual([]);
  });

  test('the login page shows no social buttons', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();

    await expect(page.getByTestId('social-buttons')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'GitHub' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Google' })).toHaveCount(0);
  });

  test('the sign-up page shows no social buttons', async ({ page }) => {
    await page.goto('/signup', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: 'Signup' })).toBeVisible();

    await expect(page.getByTestId('social-buttons')).toHaveCount(0);
  });

  test('account settings do not offer connected accounts', async ({ page }) => {
    await signUp(page, newUser());

    await page.goto('/settings');

    await expect(page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Passkeys' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Connected accounts' })).toHaveCount(0);
  });

  test('a provider sign-in cannot be started', async ({ request }) => {
    const res = await request.post('/api/auth/sign-in/social', { data: { provider: 'github' }, headers: { origin: 'http://localhost:4173' } });

    expect(res.ok()).toBe(false);
  });
});
