import { NEW_PASSWORD, newUser, PASSWORD, signIn, signOut, signUp } from './support/auth';
import { countEmails, firstLink, waitForEmail } from './support/mailbox';
import { expect, test } from './support/test';

test.describe('sign up, sign in, sign out', () => {
  test('a visitor can sign up, sign out and sign back in', async ({ page }) => {
    const user = newUser();

    await signUp(page, user);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(user.name);

    await signOut(page);

    await signIn(page, user.email, user.password);
    await expect(page.getByTestId('footer-user')).toHaveText(user.email);
  });

  test('sign-up sends a verification email', async ({ page }) => {
    const user = newUser();

    await signUp(page, user);

    await waitForEmail(user.email, 'Verify your email');
  });

  test('a wrong password is rejected and stays signed out', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);
    await signOut(page);

    await signIn(page, user.email, 'Wrong-Password-1');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });

  test('sign-up rejects a weak password before calling the server', async ({ page }) => {
    const user = newUser();
    await page.goto('/signup');
    await page.getByLabel('Name').fill(user.name);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill('weak');
    await page.getByLabel('Confirm Password').fill('weak');
    await page.getByRole('button', { name: 'Signup' }).click();

    await expect(page.getByText(/at least one uppercase letter/)).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test('a signed-out visitor is sent to sign in from settings', async ({ page }) => {
    await page.goto('/settings');

    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('password reset', () => {
  test('a user can reset a forgotten password from the emailed link', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);
    await signOut(page);

    await page.goto('/password/reset');
    await page.getByLabel('Email').fill(user.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('Check your email')).toBeVisible();

    const link = firstLink(await waitForEmail(user.email, 'Reset your password'));
    await page.goto(link);
    await expect(page).toHaveURL(/\/password\/reset\?token=/);
    await page.getByLabel('New password').fill(NEW_PASSWORD);
    await page.getByLabel('Confirm password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await waitForEmail(user.email, 'Your password was changed');
    await signIn(page, user.email, NEW_PASSWORD);
    await expect(page.getByTestId('footer-user')).toHaveText(user.email);
  });

  test('an invalid reset link offers a new request', async ({ page }) => {
    await page.goto('/api/auth/reset-password/not-a-real-token?callbackURL=/password/reset');

    await expect(page.getByText('That link did not work')).toBeVisible();
  });
});

test.describe('settings', () => {
  test('a user can update their name', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);

    await page.goto('/settings');
    await page.getByLabel('Name').fill('Emperor Penguin');
    await page.getByRole('button', { name: 'Update Profile' }).click();
    await expect(page.getByText('Profile updated!')).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Emperor Penguin');
  });

  test('a user can change their password and sign in with the new one', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);

    await page.goto('/settings/password');
    await page.getByLabel('Current password').fill(PASSWORD);
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Change Password' }).click();
    await expect(page.getByText('Password changed')).toBeVisible();
    await expect.poll(() => countEmails(user.email, 'Your password was changed')).toBe(1);

    await page.goto('/');
    await signOut(page);
    await signIn(page, user.email, NEW_PASSWORD);
    await expect(page.getByTestId('footer-user')).toHaveText(user.email);
  });

  test('changing the password needs the current one', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);

    await page.goto('/settings/password');
    await page.getByLabel('Current password').fill('Not-My-Password-1');
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Change Password' }).click();

    await expect(page.getByText(/incorrect|invalid/i)).toBeVisible();
    expect(await countEmails(user.email, 'Your password was changed')).toBe(0);
  });
});
