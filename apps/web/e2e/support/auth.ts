import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'Correct-Horse-9';
export const NEW_PASSWORD = 'Another-Horse-8';
export const ADMIN = { email: 'admin@example.com', password: process.env.ADMIN_PASSWORD ?? 'Admin-Passw0rd!' };

let counter = 0;

/** A fresh user per call so flows never collide in the shared database. */
export function newUser() {
  counter += 1;
  return {
    name: 'Penguin Tester',
    email: `penguin-${Date.now()}-${counter}@example.com`,
    password: PASSWORD,
  };
}

export type TestUser = ReturnType<typeof newUser>;

export async function signUp(page: Page, user: TestUser) {
  await page.goto('/signup', { waitUntil: 'networkidle' });
  await page.getByLabel('Name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByLabel('Confirm Password').fill(user.password);
  await page.getByRole('button', { name: 'Signup' }).click();
  await expect(page.getByTestId('footer-user')).toHaveText(user.email);
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
}

export async function signOut(page: Page) {
  // The header nests a button in the dropdown trigger, so the name matches twice.
  await page.getByRole('button', { name: 'Toggle user menu' }).first().click();
  await page.getByRole('menuitem', { name: 'Logout' }).click();
  await expect(page.getByTestId('footer')).toContainText('You are not signed in');
}
