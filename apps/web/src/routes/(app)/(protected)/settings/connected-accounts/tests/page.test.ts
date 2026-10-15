// @vitest-environment jsdom
import { SocialProvider } from '@adelie/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authClient = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  unlinkAccount: vi.fn(),
  linkSocial: vi.fn(),
}));

vi.mock('#lib/auth-client.ts', () => ({ authClient }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from 'svelte-sonner';
import { socialErrorMessage } from '#lib/client/social-auth.ts';
import { page } from '$app/state';
import ConnectedAccountsPage from '../+page.svelte';

const CREDENTIAL = { id: 'acc-pw', providerId: 'credential' };
const GITHUB = { id: 'acc-gh', providerId: 'github' };

function mount(socialProviders: SocialProvider[]) {
  return render(ConnectedAccountsPage, { data: { socialProviders, signUpEnabled: false, flash: undefined, authedUser: null } });
}

beforeEach(() => {
  authClient.listAccounts.mockReset().mockResolvedValue({ data: [CREDENTIAL], error: null });
  authClient.unlinkAccount.mockReset().mockResolvedValue({ data: { status: true }, error: null });
  authClient.linkSocial.mockReset().mockResolvedValue({ data: {}, error: null });
  vi.mocked(toast.error).mockReset();
  page.url = new URL('http://localhost/settings/connected-accounts');
});

afterEach(cleanup);

describe('connected accounts page', () => {
  it('offers to connect each configured provider that is not linked yet', async () => {
    mount([SocialProvider.GITHUB, SocialProvider.GOOGLE]);

    expect(await screen.findByRole('button', { name: 'Connect GitHub' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeTruthy();
    expect(screen.getByText('No connected accounts yet.')).toBeTruthy();
  });

  it('does not offer a provider the API has not configured', async () => {
    mount([SocialProvider.GITHUB]);

    await screen.findByRole('button', { name: 'Connect GitHub' });
    expect(screen.queryByRole('button', { name: 'Connect Google' })).toBeNull();
  });

  it('links a provider and comes back to this page, also on refusal', async () => {
    mount([SocialProvider.GITHUB]);

    await fireEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }));

    expect(authClient.linkSocial).toHaveBeenCalledExactlyOnceWith({
      provider: 'github',
      callbackURL: '/settings/connected-accounts',
      errorCallbackURL: '/settings/connected-accounts',
    });
  });

  it('lists a linked provider with Unlink and stops offering to connect it', async () => {
    authClient.listAccounts.mockResolvedValue({ data: [CREDENTIAL, GITHUB], error: null });
    mount([SocialProvider.GITHUB]);

    expect(await screen.findByTestId('connected-account-row')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unlink' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Connect GitHub' })).toBeNull();
  });

  it('unlinks by account id and reloads the list', async () => {
    authClient.listAccounts.mockResolvedValueOnce({ data: [CREDENTIAL, GITHUB], error: null }).mockResolvedValue({ data: [CREDENTIAL], error: null });
    mount([SocialProvider.GITHUB]);

    await fireEvent.click(await screen.findByRole('button', { name: 'Unlink' }));

    expect(authClient.unlinkAccount).toHaveBeenCalledExactlyOnceWith({ accountId: 'acc-gh' });
    await waitFor(() => expect(screen.queryByTestId('connected-account-row')).toBeNull());
  });

  it('cannot unlink the last sign-in method', async () => {
    authClient.listAccounts.mockResolvedValue({ data: [GITHUB], error: null });
    mount([SocialProvider.GITHUB]);

    const unlink = await screen.findByRole('button', { name: 'Unlink' });

    expect(unlink.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Your only way to sign in')).toBeTruthy();
    await fireEvent.click(unlink);
    expect(authClient.unlinkAccount).not.toHaveBeenCalled();
  });

  it('shows the server refusal when an unlink is rejected', async () => {
    authClient.listAccounts.mockResolvedValue({ data: [CREDENTIAL, GITHUB], error: null });
    authClient.unlinkAccount.mockResolvedValue({ data: null, error: { message: "You can't unlink your last account" } });
    mount([SocialProvider.GITHUB]);

    await fireEvent.click(await screen.findByRole('button', { name: 'Unlink' }));

    expect(toast.error).toHaveBeenCalledWith("You can't unlink your last account");
  });

  it('explains a refused link from the provider redirect', async () => {
    page.url = new URL('http://localhost/settings/connected-accounts?error=email_does_not_match');
    mount([SocialProvider.GITHUB]);

    await screen.findByRole('button', { name: 'Connect GitHub' });
    expect(screen.getByTestId('link-error').textContent).toBe(socialErrorMessage('email_does_not_match'));
  });
});
