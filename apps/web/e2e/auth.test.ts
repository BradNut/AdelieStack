import { NEW_PASSWORD, newUser, PASSWORD, signIn, signOut, signUp, submitSignUp, VERIFY_EMAIL_SUBJECT, verifyEmail } from './support/auth';
import { countEmails, firstLink, waitForEmail } from './support/mailbox';
import { expect, test } from './support/test';

test.describe('sign up, sign in, sign out', () => {
  test('a visitor can sign up, sign out and sign back in', async ({ page }) => {
    const user = newUser();

    await signUp(page, user);
    await expect(page.getByText(`Welcome ${user.name}`)).toBeVisible();

    await signOut(page);

    await signIn(page, user.email, user.password);
    await expect(page.getByTestId('footer-user')).toHaveText(user.email);
  });

  test('sign-up sends a verification email and signs no one in', async ({ page }) => {
    const user = newUser();

    await submitSignUp(page, user);

    await waitForEmail(user.email, VERIFY_EMAIL_SUBJECT);
    await page.goto('/');
    await expect(page.getByTestId('footer')).toContainText('You are not signed in');
  });

  test('an unverified account cannot sign in, and the login page resends the link', async ({ page }) => {
    const user = newUser();
    await submitSignUp(page, user);
    await waitForEmail(user.email, VERIFY_EMAIL_SUBJECT);

    await signIn(page, user.email, user.password);

    await expect(page.getByText('Verify your email address before signing in')).toBeVisible();
    await expect(page.getByTestId('footer')).toContainText('You are not signed in');
    await page.getByTestId('unverified-email').getByTestId('resend-verification').click();
    await expect.poll(() => countEmails(user.email, VERIFY_EMAIL_SUBJECT)).toBe(2);
  });

  test('once verified, the account signs in', async ({ page }) => {
    const user = newUser();
    await submitSignUp(page, user);

    await verifyEmail(page, user);
    await signIn(page, user.email, user.password);

    await expect(page.getByTestId('footer-user')).toHaveText(user.email);
  });

  test('sign-up with a taken address looks the same as with a new one, and sends nothing', async ({ page }) => {
    const owner = newUser();
    await signUp(page, owner);
    await signOut(page);

    await submitSignUp(page, { ...owner, name: 'Someone Else' });

    await expect(page.getByText(`We sent a link to ${owner.email}`)).toBeVisible();
    expect(await countEmails(owner.email, VERIFY_EMAIL_SUBJECT)).toBe(1);
    await signIn(page, owner.email, owner.password);
    await expect(page.getByTestId('footer-user')).toHaveText(owner.email);
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

    await expect(page.getByText(/at least 8 characters/)).toBeVisible();
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
    await expect(page.getByText('Welcome Emperor Penguin')).toBeVisible();
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
