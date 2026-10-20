// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authClient = vi.hoisted(() => ({
  signIn: { email: vi.fn(), passkey: vi.fn() },
  twoFactor: { verifyTotp: vi.fn(), verifyOtp: vi.fn(), verifyBackupCode: vi.fn(), sendOtp: vi.fn() },
  getLastUsedLoginMethod: vi.fn(() => null),
}));

vi.mock('#lib/auth-client.ts', () => ({ authClient }));
vi.mock('#lib/client/captcha/config.ts', () => ({ getCaptchaConfig: async () => ({ enabled: false }) }));
vi.mock('#lib/client/auth-form.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/client/auth-form.ts')>()),
  refreshSession: vi.fn(),
}));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { goto } from '$app/navigation';
import { page } from '$app/state';
import LoginPage from '../login/+page.svelte';
import TwoFactorPage from '../login/two-factor/+page.svelte';

const loginData = { signUpEnabled: true, flash: undefined, authedUser: null, socialProviders: [] };
const OK = { data: {}, error: null };

async function signInWithPassword() {
  render(LoginPage, { data: loginData });
  await fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
  await fireEvent.input(screen.getAllByLabelText('Password')[0] as HTMLElement, { target: { value: 'correct horse battery' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Login' }));
}

beforeEach(() => {
  for (const fn of [authClient.signIn.email, authClient.signIn.passkey, ...Object.values(authClient.twoFactor)]) fn.mockReset();
  vi.mocked(goto).mockReset();
  page.url = new URL('http://localhost/login');
});

afterEach(cleanup);

describe('login page', () => {
  it('sends a two-factor account to the two-factor page', async () => {
    authClient.signIn.email.mockResolvedValue({ data: { twoFactorRedirect: true }, error: null });

    await signInWithPassword();

    await waitFor(() => expect(goto).toHaveBeenCalledExactlyOnceWith('/login/two-factor'));
  });

  it('carries the return path to the two-factor page', async () => {
    page.url = new URL('http://localhost/login?returnTo=%2Fsettings%2Fsecurity');
    authClient.signIn.email.mockResolvedValue({ data: { twoFactorRedirect: true }, error: null });

    await signInWithPassword();

    await waitFor(() => expect(goto).toHaveBeenCalledExactlyOnceWith('/login/two-factor?returnTo=%2Fsettings%2Fsecurity'));
  });

  it.each([
    ['home without a return path', 'http://localhost/login', '/'],
    ['the return path', 'http://localhost/login?returnTo=%2Fsettings%2Fconnected-accounts%3Ftab%3D1', '/settings/connected-accounts?tab=1'],
    ['home for a return path to another site', 'http://localhost/login?returnTo=%2F%2Fevil.example', '/'],
    ['home for an absolute return URL', 'http://localhost/login?returnTo=https%3A%2F%2Fevil.example', '/'],
  ])('finishes a password sign-in on %s', async (_name, url, target) => {
    page.url = new URL(url);
    authClient.signIn.email.mockResolvedValue(OK);

    await signInWithPassword();

    await waitFor(() => expect(goto).toHaveBeenCalledExactlyOnceWith(target));
  });

  it('finishes a passkey sign-in on the return path', async () => {
    page.url = new URL('http://localhost/login?returnTo=%2Fsettings%2Fsecurity');
    authClient.signIn.passkey.mockResolvedValue(OK);
    render(LoginPage, { data: loginData });

    await fireEvent.click(screen.getByRole('button', { name: /Sign in with a passkey/ }));

    await waitFor(() => expect(goto).toHaveBeenCalledExactlyOnceWith('/settings/security'));
  });
});

describe('two-factor page', () => {
  async function verifyCode() {
    render(TwoFactorPage);
    await fireEvent.input(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  }

  it('finishes on the return path once the code is accepted', async () => {
    page.url = new URL('http://localhost/login/two-factor?returnTo=%2Fsettings%2Fsecurity');
    authClient.twoFactor.verifyTotp.mockResolvedValue(OK);

    await verifyCode();

    await waitFor(() => expect(goto).toHaveBeenCalledExactlyOnceWith('/settings/security'));
    expect(authClient.twoFactor.verifyTotp).toHaveBeenCalledExactlyOnceWith({ code: '123456' });
  });

  it('finishes at home without a return path', async () => {
    page.url = new URL('http://localhost/login/two-factor');
    authClient.twoFactor.verifyTotp.mockResolvedValue(OK);

    await verifyCode();

    await waitFor(() => expect(goto).toHaveBeenCalledExactlyOnceWith('/'));
  });

  it('shows an expired challenge inline, as before', async () => {
    page.url = new URL('http://localhost/login/two-factor');
    authClient.twoFactor.verifyTotp.mockResolvedValue({
      data: null,
      error: { status: 401, code: 'INVALID_TWO_FACTOR_COOKIE', message: 'Invalid two factor cookie' },
    });

    await verifyCode();

    expect(await screen.findByText('Invalid two factor cookie')).toBeTruthy();
    expect(goto).not.toHaveBeenCalled();
  });
});
