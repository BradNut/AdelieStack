import { ADMIN, newUser, signIn, signUp } from './support/auth';
import { expect, test } from './support/test';

test.describe('sessions', () => {
  test('a user can list sessions and revoke all the others', async ({ page, browser }) => {
    const user = newUser();
    await signUp(page, user);
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await signIn(other, user.email, user.password);
    await expect(other.getByTestId('footer-user')).toHaveText(user.email);

    await page.goto('/settings/security');
    await expect(page.getByTestId('session-row')).toHaveCount(2);
    await expect(page.getByTestId('current-session')).toHaveCount(1);

    await page.getByRole('button', { name: 'Sign out of all other sessions' }).click();
    await expect(page.getByTestId('session-row')).toHaveCount(1);

    await other.reload();
    await expect(other.getByTestId('footer')).toContainText('You are not signed in');
    await otherContext.close();
  });

  test('a user can revoke a single session', async ({ page, browser }) => {
    const user = newUser();
    await signUp(page, user);
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await signIn(other, user.email, user.password);
    await expect(other.getByTestId('footer-user')).toHaveText(user.email);

    await page.goto('/settings/security');
    await expect(page.getByTestId('session-row')).toHaveCount(2);
    await page.getByRole('button', { name: 'Revoke', exact: true }).click();
    await expect(page.getByTestId('session-row')).toHaveCount(1);

    await other.reload();
    await expect(other.getByTestId('footer')).toContainText('You are not signed in');
    await otherContext.close();
  });
});

test.describe('admin guard', () => {
  test('a signed-out visitor is sent to sign in', async ({ page }) => {
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/login$/);
  });

  test('a regular user is refused', async ({ page }) => {
    await signUp(page, newUser());

    const response = await page.goto('/admin');

    expect(response?.status()).toBe(403);
  });

  test('an admin can open the admin page', async ({ page }) => {
    await signIn(page, ADMIN.email, ADMIN.password);
    await expect(page.getByTestId('footer-user')).toHaveText(ADMIN.email);

    const response = await page.goto('/admin');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
    await expect(page.getByRole('cell', { name: ADMIN.email })).toBeVisible();
  });
});
