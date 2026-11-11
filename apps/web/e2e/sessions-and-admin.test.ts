import type { Page } from '@playwright/test';
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

/** Adds a CDP virtual authenticator that answers WebAuthn prompts without user interaction. */
async function addVirtualAuthenticator(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'usb',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

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

  test('the seeded admin enrols a Second Factor on first use, then opens the admin page', async ({ page }) => {
    await addVirtualAuthenticator(page);
    await signIn(page, ADMIN.email, ADMIN.password);
    await expect(page.getByTestId('footer-user')).toHaveText(ADMIN.email);

    // First run against a fresh database: the seeded admin has no Second Factor, so the admin page sends them to
    // enrolment instead of an error (ADR 0014). The passkey row stays, so later runs on the same database skip this.
    await page.goto('/admin');
    if (page.url().endsWith('/settings/two-factor')) {
      await page.goto('/settings/passkeys');
      await page.getByRole('button', { name: 'Add a passkey' }).click();
      await expect(page.getByTestId('passkey-row')).toHaveCount(1);
    }

    const response = await page.goto('/admin');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
    await expect(page.getByRole('cell', { name: ADMIN.email })).toBeVisible();
  });
});
