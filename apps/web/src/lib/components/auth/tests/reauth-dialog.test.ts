// @vitest-environment jsdom
import { CREDENTIAL_PROVIDER_ID } from '@adelie/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authClient = vi.hoisted(() => ({
  getSession: vi.fn(),
  listAccounts: vi.fn(),
  passkey: { listUserPasskeys: vi.fn() },
  signIn: { email: vi.fn(), passkey: vi.fn() },
}));

vi.mock('#lib/auth-client.ts', () => ({ authClient }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));

import { freshSession, ReauthOutcome } from '#lib/client/fresh-session.svelte.ts';
import ReauthDialog from '../reauth-dialog.svelte';

const USER = { email: 'a@example.com', twoFactorEnabled: false };

function setup({ user = USER, accounts = [{ providerId: CREDENTIAL_PROVIDER_ID }], passkeys = [] as unknown[] } = {}) {
  authClient.getSession.mockResolvedValue({ data: { user }, error: null });
  authClient.listAccounts.mockResolvedValue({ data: accounts, error: null });
  authClient.passkey.listUserPasskeys.mockResolvedValue({ data: passkeys, error: null });
}

function open() {
  render(ReauthDialog);
  return freshSession.request();
}

beforeEach(() => {
  freshSession.settle(ReauthOutcome.DISMISSED);
  authClient.signIn.email.mockReset().mockResolvedValue({ data: {}, error: null });
  authClient.signIn.passkey.mockReset().mockResolvedValue({ data: {}, error: null });
  setup();
});

afterEach(cleanup);

describe('ReauthDialog', () => {
  it('stays closed until a stale session asks for it', () => {
    render(ReauthDialog);

    expect(screen.queryByTestId('reauth-dialog')).toBeNull();
  });

  it('signs in again with the typed password and confirms', async () => {
    const outcome = open();

    await fireEvent.input(await screen.findByLabelText('Password'), { target: { value: 'Correct-Horse-9' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await outcome).toBe(ReauthOutcome.CONFIRMED);
    expect(authClient.signIn.email).toHaveBeenCalledWith({ email: 'a@example.com', password: 'Correct-Horse-9' });
  });

  it('keeps the dialog open with a translated error on a wrong password', async () => {
    authClient.signIn.email.mockResolvedValue({ data: null, error: { status: 401, message: 'Invalid email or password' } });
    const outcome = open();
    const settled = vi.fn();
    outcome.then(settled);

    await fireEvent.input(await screen.findByLabelText('Password'), { target: { value: 'nope' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect((await screen.findByTestId('reauth-error')).textContent).toBe('Password is incorrect.');
    expect(freshSession.open).toBe(true);
    expect(settled).not.toHaveBeenCalled();
  });

  it('does not confirm when password sign-in answers with a two-factor challenge', async () => {
    authClient.signIn.email.mockResolvedValue({ data: { twoFactorRedirect: true }, error: null });
    const outcome = open();
    const settled = vi.fn();
    outcome.then(settled);

    await fireEvent.input(await screen.findByLabelText('Password'), { target: { value: 'Correct-Horse-9' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect((await screen.findByTestId('reauth-error')).textContent).toBe('Sign out and sign in again to continue.');
    expect(settled).not.toHaveBeenCalled();
  });

  it('falls back to sign out and in when the lookup fails', async () => {
    authClient.listAccounts.mockRejectedValue(new Error('offline'));
    open();

    expect((await screen.findByTestId('reauth-fallback')).textContent).toBe('Sign out and sign in again to continue.');
  });

  it('resolves as dismissed on cancel', async () => {
    const outcome = open();

    await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(await outcome).toBe(ReauthOutcome.DISMISSED);
    expect(authClient.signIn.email).not.toHaveBeenCalled();
  });

  it('offers a passkey when the user has one, and confirms with it', async () => {
    setup({ passkeys: [{ id: 'pk' }] });
    const outcome = open();

    await fireEvent.click(await screen.findByRole('button', { name: 'Use a passkey' }));

    expect(await outcome).toBe(ReauthOutcome.CONFIRMED);
    expect(authClient.signIn.passkey).toHaveBeenCalledOnce();
  });

  it('offers only a passkey to a user without a password', async () => {
    setup({ accounts: [{ providerId: 'github' }], passkeys: [{ id: 'pk' }] });
    open();

    await screen.findByRole('button', { name: 'Use a passkey' });
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('shows an error and stays open when the passkey fails', async () => {
    setup({ passkeys: [{ id: 'pk' }] });
    authClient.signIn.passkey.mockResolvedValue({ data: null, error: { message: 'cancelled' } });
    open();

    await fireEvent.click(await screen.findByRole('button', { name: 'Use a passkey' }));

    await waitFor(() => expect(screen.getByTestId('reauth-error').textContent).toContain('passkey could not be verified'));
    expect(freshSession.open).toBe(true);
  });

  it.each([
    ['a social-only user without passkeys', { accounts: [{ providerId: 'github' }] }],
    ['a two-factor user without passkeys', { user: { ...USER, twoFactorEnabled: true } }],
  ])('tells %s to sign out and in again', async (_name, overrides) => {
    setup(overrides);
    open();

    expect((await screen.findByTestId('reauth-fallback')).textContent).toBe('Sign out and sign in again to continue.');
    expect(screen.queryByLabelText('Password')).toBeNull();
  });
});
