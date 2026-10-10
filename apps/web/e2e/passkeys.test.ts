import type { Page } from '@playwright/test';
import { newUser, signIn, signOut, signUp } from './support/auth';
import { expect, test } from './support/test';

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

test('a user can register a passkey, sign in with it, and delete it', async ({ page }) => {
  await addVirtualAuthenticator(page);
  const user = newUser();
  await signUp(page, user);

  await page.goto('/settings/passkeys');
  await expect(page.getByText('No passkeys yet.')).toBeVisible();
  await page.getByLabel('Name (optional)').fill('Laptop');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByTestId('passkey-row')).toContainText('Laptop');

  await page.goto('/');
  await signOut(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page.getByTestId('footer-user')).toHaveText(user.email);

  await page.goto('/settings/passkeys');
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No passkeys yet.')).toBeVisible();
});

test('a user can register a hardware security key', async ({ page }) => {
  await addVirtualAuthenticator(page);
  const user = newUser();
  await signUp(page, user);

  await page.goto('/settings/passkeys');
  await page.getByLabel('Name (optional)').fill('YubiKey');
  await page.getByRole('button', { name: 'Add a security key' }).click();

  await expect(page.getByTestId('passkey-row')).toContainText('YubiKey');
});

test('a deleted passkey can no longer sign in', async ({ page }) => {
  await addVirtualAuthenticator(page);
  const user = newUser();
  await signUp(page, user);
  await page.goto('/settings/passkeys');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByTestId('passkey-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No passkeys yet.')).toBeVisible();
  await page.goto('/');
  await signOut(page);

  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();

  await expect(page.getByTestId('footer-user')).toHaveCount(0);
  await expect(page).toHaveURL(/\/login$/);
});

test('password sign-in still works for a user with a passkey', async ({ page }) => {
  await addVirtualAuthenticator(page);
  const user = newUser();
  await signUp(page, user);
  await page.goto('/settings/passkeys');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByTestId('passkey-row')).toHaveCount(1);
  await page.goto('/');
  await signOut(page);

  await signIn(page, user.email, user.password);

  await expect(page.getByTestId('footer-user')).toHaveText(user.email);
});
