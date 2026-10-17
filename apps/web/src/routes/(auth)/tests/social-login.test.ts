// @vitest-environment jsdom
import { SocialAuthErrorCode, SocialProvider } from '@adelie/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authClient = vi.hoisted(() => ({
  signIn: { email: vi.fn(), passkey: vi.fn(), social: vi.fn() },
  signUp: { email: vi.fn() },
  getLastUsedLoginMethod: vi.fn(() => null),
}));

vi.mock('#lib/auth-client.ts', () => ({ authClient }));
vi.mock('#lib/client/captcha/config.ts', () => ({ getCaptchaConfig: async () => ({ enabled: false }) }));
vi.mock('mode-watcher', () => ({ mode: { current: 'light' } }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from 'svelte-sonner';
import { socialErrorMessage } from '#lib/client/social-auth.ts';
import { page } from '$app/state';
import LoginPage from '../login/+page.svelte';
import SignupPage from '../signup/+page.svelte';

const data = (socialProviders: SocialProvider[]) => ({ signUpEnabled: true, socialProviders, flash: undefined, authedUser: null });

beforeEach(() => {
  authClient.signIn.social.mockReset().mockResolvedValue({ data: {}, error: null });
  vi.mocked(toast.error).mockReset();
  page.url = new URL('http://localhost/login');
});

afterEach(cleanup);

describe('login page social buttons', () => {
  it('shows no social buttons on a fresh install', () => {
    render(LoginPage, { data: data([]) });

    expect(screen.queryByTestId('social-buttons')).toBeNull();
    expect(screen.queryByRole('button', { name: 'GitHub' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Google' })).toBeNull();
  });

  it('shows a button for each configured provider only', () => {
    render(LoginPage, { data: data([SocialProvider.GITHUB]) });

    expect(screen.getByRole('button', { name: 'GitHub' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Google' })).toBeNull();
  });

  it('starts the provider sign-in and returns to the login page on refusal', async () => {
    render(LoginPage, { data: data([SocialProvider.GOOGLE]) });

    await fireEvent.click(screen.getByRole('button', { name: 'Google' }));

    expect(authClient.signIn.social).toHaveBeenCalledExactlyOnceWith({ provider: 'google', callbackURL: '/', errorCallbackURL: '/login' });
  });

  it('toasts when the sign-in cannot start', async () => {
    authClient.signIn.social.mockResolvedValue({ data: null, error: { message: 'Provider not found' } });
    render(LoginPage, { data: data([SocialProvider.GITHUB]) });

    await fireEvent.click(screen.getByRole('button', { name: 'GitHub' }));

    expect(toast.error).toHaveBeenCalledWith('Provider not found');
  });

  it('shows no error for a normal visit', () => {
    render(LoginPage, { data: data([SocialProvider.GITHUB]) });

    expect(screen.queryByTestId('social-error')).toBeNull();
  });

  it.each(Object.values(SocialAuthErrorCode))('explains the %s refusal', (code) => {
    page.url = new URL(`http://localhost/login?error=${code}`);
    render(LoginPage, { data: data([SocialProvider.GITHUB]) });

    expect(screen.getByTestId('social-error').textContent).toBe(socialErrorMessage(code));
  });

  it('uses a generic message for a refusal it has no copy for', () => {
    page.url = new URL('http://localhost/login?error=something_new');
    render(LoginPage, { data: data([SocialProvider.GITHUB]) });

    expect(screen.getByTestId('social-error').textContent).toBe(socialErrorMessage('something_new'));
  });
});

describe('signup page social buttons', () => {
  it('shows no social buttons when none is configured', () => {
    render(SignupPage, { data: data([]) });

    expect(screen.queryByTestId('social-buttons')).toBeNull();
  });

  it('shows the configured providers', () => {
    render(SignupPage, { data: data([SocialProvider.GITHUB, SocialProvider.GOOGLE]) });

    expect(screen.getByRole('button', { name: 'GitHub' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Google' })).toBeTruthy();
  });
});
