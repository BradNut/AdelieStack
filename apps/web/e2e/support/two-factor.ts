import { totpCode } from '@adelie/test-utils/totp';
import { expect, type Page } from '@playwright/test';
import { PASSWORD } from './auth';

/** Enrols TOTP from the settings page and returns what an authenticator app would hold. */
export async function enrolTotp(page: Page) {
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
