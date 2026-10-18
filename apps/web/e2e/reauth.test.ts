import { newUser, signUp } from './support/auth';
import { makeSessionsStale } from './support/db';
import { expect, test } from './support/test';

test.describe('re-authentication on a stale session', () => {
  test('viewing sessions asks for the password, then loads the list', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);
    await makeSessionsStale(user.email);

    await page.goto('/settings/security');
    const dialog = page.getByTestId('reauth-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Password').fill(user.password);
    await dialog.getByRole('button', { name: 'Confirm' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('session-row')).toHaveCount(2);
  });

  test('a wrong password keeps the dialog open with an error', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);
    await makeSessionsStale(user.email);

    await page.goto('/settings/security');
    const dialog = page.getByTestId('reauth-dialog');
    await dialog.getByLabel('Password').fill('Wrong-Horse-1');
    await dialog.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByTestId('reauth-error')).toHaveText('Password is incorrect.');
    await expect(dialog).toBeVisible();
  });

  test('dismissing the prompt leaves a way to retry', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);
    await makeSessionsStale(user.email);

    await page.goto('/settings/security');
    await page.getByTestId('reauth-dialog').getByRole('button', { name: 'Cancel' }).click();

    const inline = page.getByTestId('sessions-reauth');
    await expect(inline).toContainText('Confirm your password to view your sessions');
    await inline.getByRole('button', { name: 'Confirm' }).click();
    await page.getByTestId('reauth-dialog').getByLabel('Password').fill(user.password);
    await page.getByTestId('reauth-dialog').getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByTestId('session-row')).toHaveCount(2);
    await expect(inline).toBeHidden();
  });
});
