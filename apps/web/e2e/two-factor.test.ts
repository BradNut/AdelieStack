import type { Page } from '@playwright/test';
import { newUser, PASSWORD, signIn, signOut, signUp, type TestUser } from './support/auth';
import { countEmails, waitForEmail } from './support/mailbox';
import { expect, test } from './support/test';
import { totpCode } from './support/totp';

/** Enrols TOTP from the settings page and returns what an authenticator app would hold. */
async function enrolTotp(page: Page) {
  await page.goto('/settings/two-factor');
  await page.getByLabel('Password to set up two-factor').fill(PASSWORD);
  await page.getByRole('button', { name: 'Set up two-factor' }).click();

  const totpURI = (await page.getByTestId('totp-uri').textContent()) ?? '';
  const recoveryCodes = await page.getByTestId('recovery-codes').getByRole('listitem').allTextContents();
  expect(recoveryCodes.length).toBeGreaterThan(0);

  await page.getByLabel('Authenticator code').fill(totpCode(totpURI));
  await page.getByRole('button', { name: 'Confirm and turn on' }).click();
  await expect(page.getByText('Two-factor authentication is on', { exact: true }).first()).toBeVisible();
  return { totpURI, recoveryCodes };
}

async function signedUpWithTotp(page: Page) {
  const user: TestUser = newUser();
  await signUp(page, user);
  const factors = await enrolTotp(page);
  await page.goto('/');
  await signOut(page);
  return { user, ...factors };
}

test('a user can enrol TOTP and then needs a code to sign in', async ({ page }) => {
  const { user, totpURI } = await signedUpWithTotp(page);

  await signIn(page, user.email, user.password);
  await expect(page).toHaveURL(/\/login\/two-factor$/);
  await expect(page.getByTestId('footer-user')).toHaveCount(0);

  await page.getByLabel('Authenticator code').fill(totpCode(totpURI));
  await page.getByRole('button', { name: 'Verify' }).click();

  await expect(page.getByTestId('footer-user')).toHaveText(user.email);
});

test('a wrong TOTP code does not sign the user in', async ({ page }) => {
  const { user, totpURI } = await signedUpWithTotp(page);
  await signIn(page, user.email, user.password);
  const valid = totpCode(totpURI);
  const wrong = valid === '000000' ? '111111' : '000000';

  await page.getByLabel('Authenticator code').fill(wrong);
  await page.getByRole('button', { name: 'Verify' }).click();

  await expect(page.getByText(/invalid/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login\/two-factor$/);
});

test('a recovery code signs the user in once and sends a notice', async ({ page }) => {
  const { user, recoveryCodes } = await signedUpWithTotp(page);
  const [code] = recoveryCodes;

  await signIn(page, user.email, user.password);
  await page.getByRole('tab', { name: 'Recovery' }).click();
  await page.getByLabel('Recovery code').fill(code);
  await page.getByRole('button', { name: 'Use recovery code' }).click();
  await expect(page.getByTestId('footer-user')).toHaveText(user.email);
  await waitForEmail(user.email, 'A recovery code was used');
  expect(await countEmails(user.email, 'A recovery code was used')).toBe(1);

  await page.goto('/');
  await signOut(page);
  await signIn(page, user.email, user.password);
  await page.getByRole('tab', { name: 'Recovery' }).click();
  await page.getByLabel('Recovery code').fill(code);
  await page.getByRole('button', { name: 'Use recovery code' }).click();
  await expect(page.getByText(/invalid/i)).toBeVisible();
});

test('an emailed code signs the user in', async ({ page }) => {
  const { user } = await signedUpWithTotp(page);

  await signIn(page, user.email, user.password);
  await page.getByRole('tab', { name: 'Email' }).click();
  await page.getByRole('button', { name: 'Email me a code' }).click();
  const html = await waitForEmail(user.email, 'Your sign-in code');
  const otp = /token-text'>(\d{6})</.exec(html)?.[1];
  expect(otp).toBeTruthy();

  await page.getByLabel('Emailed code').fill(otp ?? '');
  await page.getByRole('button', { name: 'Verify' }).click();

  await expect(page.getByTestId('footer-user')).toHaveText(user.email);
});

test('regenerating recovery codes invalidates the old ones and sends a notice', async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await enrolTotp(page);

  await page.getByLabel('Password to regenerate codes').fill(PASSWORD);
  await page.getByRole('button', { name: 'Regenerate codes' }).click();
  await expect(page.getByTestId('recovery-codes')).toBeVisible();

  await waitForEmail(user.email, 'Your recovery codes were regenerated');
  expect(await countEmails(user.email, 'Your recovery codes were regenerated')).toBe(1);
});

test('a user can turn two-factor off with their password', async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await enrolTotp(page);

  await page.getByLabel('Password to turn off two-factor').fill(PASSWORD);
  await page.getByRole('button', { name: 'Turn off' }).click();

  await expect(page.getByText('Two-factor authentication is off', { exact: true }).first()).toBeVisible();
});
