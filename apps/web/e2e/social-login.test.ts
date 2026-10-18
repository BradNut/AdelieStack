import { SOCIAL_WEB_ORIGIN } from '../playwright.config';
import { newUser, signUp } from './support/auth';
import { linkProviderAccount, makeSessionsStale } from './support/db';
import { expect, test } from './support/test';

// The e2e API runs without provider credentials, as a fresh install does.
test.describe('with no social provider configured', () => {
  test('the public config reports no providers', async ({ request }) => {
    const res = await request.get('/api/config');

    expect(res.ok()).toBe(true);
    expect(((await res.json()) as { socialProviders: string[] }).socialProviders).toEqual([]);
  });

  test('the login page shows no social buttons', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();

    await expect(page.getByTestId('social-buttons')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'GitHub' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Google' })).toHaveCount(0);
  });

  test('the sign-up page shows no social buttons', async ({ page }) => {
    await page.goto('/signup', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: 'Signup' })).toBeVisible();

    await expect(page.getByTestId('social-buttons')).toHaveCount(0);
  });

  test('account settings do not offer connected accounts', async ({ page }) => {
    await signUp(page, newUser());

    await page.goto('/settings');

    await expect(page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Passkeys' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Connected accounts' })).toHaveCount(0);
  });

  test('a provider sign-in cannot be started', async ({ request }) => {
    const res = await request.post('/api/auth/sign-in/social', { data: { provider: 'github' }, headers: { origin: 'http://localhost:4173' } });

    expect(res.ok()).toBe(false);
  });
});

// A second API holds a placeholder GitHub credential pair (see playwright.config.ts); Google stays unset.
test.describe('with a social provider configured', () => {
  test.use({ baseURL: SOCIAL_WEB_ORIGIN });

  test('the public config lists only the configured provider', async ({ request }) => {
    const res = await request.get('/api/config');

    expect(((await res.json()) as { socialProviders: string[] }).socialProviders).toEqual(['github']);
  });

  test('the login page shows a button for the configured provider only', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByTestId('social-buttons')).toBeVisible();
    await expect(page.getByRole('button', { name: 'GitHub' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Google' })).toHaveCount(0);
  });

  test('the sign-up page shows the same button', async ({ page }) => {
    await page.goto('/signup');

    await expect(page.getByRole('button', { name: 'GitHub' })).toBeVisible();
  });
});

// Re-authenticating with a provider on a stale session. The authorize request is intercepted, so no provider is contacted.
test.describe('re-authentication with a linked provider', () => {
  test.use({ baseURL: SOCIAL_WEB_ORIGIN });

  test('the dialog sends the browser to the provider asking for an account choice, and keeps the action pending', async ({ page }) => {
    const user = newUser();
    await signUp(page, user);
    await linkProviderAccount(user.email, 'github');
    await makeSessionsStale(user.email);
    let authorizeUrl: URL | undefined;
    // The page leaves for the provider's origin, taking its sessionStorage along, so every write to it is reported out.
    let stored: string | null = null;
    await page.exposeFunction('reportStorageWrite', (key: string, value: string) => {
      if (key === 'adelie.reauth.pending') stored = value;
    });
    await page.addInitScript(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        (window as unknown as { reportStorageWrite(key: string, value: string): void }).reportStorageWrite(key, value);
        return setItem.call(this, key, value);
      };
    });
    await page.route('https://github.com/login/oauth/authorize**', async (route) => {
      authorizeUrl = new URL(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<title>provider</title>' });
    });

    await page.goto('/settings/connected-accounts?tab=1');
    const startRequest = page.waitForRequest((request) => request.url().endsWith('/api/auth/sign-in/social'));
    await page.getByRole('button', { name: 'Unlink' }).click();
    const dialog = page.getByTestId('reauth-dialog');
    await expect(dialog.getByLabel('Password')).toBeVisible();
    await dialog.getByRole('button', { name: 'Continue with GitHub' }).click();

    await expect.poll(() => authorizeUrl?.searchParams.get('prompt')).toBe('select_account');
    // Whether the provider honours the hint is up to it (GitHub's authorize URL carries none), so it is checked where it is sent.
    expect((await startRequest).postDataJSON()).toMatchObject({
      provider: 'github',
      loginHint: user.email,
      callbackURL: '/settings/connected-accounts?tab=1',
      errorCallbackURL: '/settings/connected-accounts?tab=1',
    });
    expect(JSON.parse(stored ?? 'null')).toMatchObject({ action: { key: 'unlink-account' }, userId: expect.any(String) });
  });
});
