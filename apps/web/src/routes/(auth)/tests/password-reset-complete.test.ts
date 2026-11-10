// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authClient = vi.hoisted(() => ({ resetPassword: vi.fn(), requestPasswordReset: vi.fn() }));

vi.mock('#lib/auth-client.ts', () => ({ authClient }));
vi.mock('#lib/client/captcha/config.ts', () => ({ getCaptchaConfig: async () => ({ enabled: false }) }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { goto } from '$app/navigation';
import ResetPage from '../password/reset/+page.svelte';

const NEW_PASSWORD = 'correct horse battery';
const data = { signUpEnabled: true, flash: undefined, authedUser: null, socialProviders: [], token: 'link-token', linkError: null };

async function submitNewPassword() {
  render(ResetPage, { data });
  await fireEvent.input(screen.getByLabelText('New password'), { target: { value: NEW_PASSWORD } });
  await fireEvent.input(screen.getByLabelText('Confirm password'), { target: { value: NEW_PASSWORD } });
  await fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
}

beforeEach(() => {
  authClient.resetPassword.mockReset();
  vi.mocked(goto).mockReset();
});

afterEach(cleanup);

describe('completing a password reset', () => {
  it('sends the browser, now signed out, to sign in', async () => {
    authClient.resetPassword.mockResolvedValue({ data: { status: true }, error: null });

    await submitNewPassword();

    await waitFor(() => expect(goto).toHaveBeenCalledWith('/login'));
    expect(authClient.resetPassword).toHaveBeenCalledWith({ newPassword: NEW_PASSWORD, token: 'link-token' });
  });

  it('stays on the form and shows why when the reset fails', async () => {
    authClient.resetPassword.mockResolvedValue({ data: null, error: { status: 400, message: 'Invalid token' } });

    await submitNewPassword();

    expect(await screen.findByText('Invalid token')).toBeTruthy();
    expect(goto).not.toHaveBeenCalled();
  });
});
