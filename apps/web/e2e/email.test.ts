import { newUser, PASSWORD, signIn, signUp } from './support/auth';
import { countEmails, firstLink, waitForEmail } from './support/mailbox';
import { expect, test } from './support/test';

test.describe('email verification', () => {
  test('the verification link lands on a page that says the email is verified', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);
    await expect(page.getByTestId('unverified-email-notice')).toBeVisible();

    await page.goto(firstLink(await waitForEmail(user.email, 'Verify your email')));

    await expect(page).toHaveURL(/\/email-verified$/);
    await expect(page.getByTestId('verification-success')).toBeVisible();
    // The signed-in layout picks up the verified state without a manual reload.
    await expect(page.getByTestId('unverified-email-notice')).toHaveCount(0);
  });

  test('an invalid link shows an error and a signed-in user can resend', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);

    await page.goto('/api/auth/verify-email?token=not-a-real-token&callbackURL=/email-verified');

    await expect(page.getByTestId('verification-failed')).toBeVisible();
    await page.getByTestId('verification-result').getByTestId('resend-verification').click();
    await expect.poll(() => countEmails(user.email, 'Verify your email')).toBe(2);
  });

  test('the unverified hint offers a resend that arrives in the mailbox', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);
    await waitForEmail(user.email, 'Verify your email');

    await page.getByTestId('unverified-email-notice').getByTestId('resend-verification').click();

    await expect.poll(() => countEmails(user.email, 'Verify your email')).toBe(2);
  });

  test('a signed-out visitor with a bad link is sent to sign in', async ({ page }) => {
    await page.goto('/email-verified?error=INVALID_TOKEN');

    await expect(page.getByTestId('verification-failed')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in to request a new link' })).toBeVisible();
  });
});

test.describe('change email', () => {
  test('a user can request a change, confirm it from the new address and the old address is told', async ({ page }) => {
    const user = newUser();
    const newEmail = `moved-${user.email}`;
    await signUp(page, user);

    await page.goto('/settings/email');
    await page.getByLabel('New email').fill(newEmail);
    await page.getByRole('button', { name: 'Change email' }).click();
    await expect(page.getByTestId('email-change-pending')).toBeVisible();
    await expect(page.getByTestId('current-email')).toHaveText(user.email);

    await page.goto(firstLink(await waitForEmail(newEmail, 'Confirm your new email address')));

    await expect(page).toHaveURL(/\/email-changed$/);
    await expect(page.getByTestId('verification-success')).toBeVisible();
    await expect(page.getByTestId('footer-user')).toHaveText(newEmail);
    await waitForEmail(user.email, 'Your email address was changed');
  });

  test('an invalid address shows an error and sends nothing', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);

    await page.goto('/settings/email');
    await page.getByLabel('New email').fill('not-an-email');
    await page.getByRole('button', { name: 'Change email' }).click();

    await expect(page.getByText('Please enter a valid email')).toBeVisible();
    await expect(page.getByTestId('email-change-pending')).toHaveCount(0);
  });

  test('an address that belongs to another account sends nothing', async ({ page }) => {
    const taken = newUser();
    await signUp(page, taken);
    await page.context().clearCookies();
    const user = newUser();
    await signUp(page, user);

    await page.goto('/settings/email');
    await page.getByLabel('New email').fill(taken.email);
    await page.getByRole('button', { name: 'Change email' }).click();
    await expect(page.getByTestId('email-change-pending')).toBeVisible();

    // The shared inbox holds only taken's own sign-up email: no confirmation was sent to it.
    expect(await countEmails(taken.email, 'Confirm your new email address')).toBe(0);
  });

  test('a signed-out visitor cannot reach the page', async ({ page }) => {
    await page.goto('/settings/email');

    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('delete account', () => {
  test('a wrong password deletes nothing', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);

    await page.goto('/settings');
    await page.getByTestId('delete-account-open').click();
    await page.getByLabel('Password').fill('Wrong-Password-1');
    await page.getByRole('button', { name: 'Delete my account' }).click();

    await expect(
      page
        .getByRole('dialog')
        .getByText(/password/i)
        .first(),
    ).toBeVisible();
    await page.goto('/');
    await expect(page.getByTestId('footer-user')).toHaveText(user.email);
  });

  test('confirming with the password deletes the account and signs the user out', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);

    await page.goto('/settings');
    await page.getByTestId('delete-account-open').click();
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Delete my account' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Your account was deleted.')).toBeVisible();
    await expect(page.getByTestId('footer')).toContainText('You are not signed in');

    await signIn(page, user.email, user.password);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });
});
