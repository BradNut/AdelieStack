// @vitest-environment jsdom
import { AppRoute } from '@adelie/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authClient = vi.hoisted(() => ({ resetPassword: vi.fn(), requestPasswordReset: vi.fn(), signOut: vi.fn() }));

vi.mock('#lib/auth-client.ts', () => ({ authClient }));
vi.mock('#lib/client/captcha/config.ts', () => ({ getCaptchaConfig: async () => ({ enabled: false }) }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import * as m from '#lib/paraglide/messages.js';
import { buildAuthedUser } from '#lib/tests/factories.ts';
import { goto } from '$app/navigation';
import ResetPage from '../password/reset/+page.svelte';

const NEW_PASSWORD = 'correct horse battery';
const SIGN_OUT_NOTE = m.password_reset_signs_out_everywhere();
const signedOut = { signUpEnabled: true, flash: undefined, authedUser: null, socialProviders: [], token: 'link-token', linkError: null };
const signedIn = { ...signedOut, authedUser: buildAuthedUser() };

async function submitNewPassword(data: ComponentProps<typeof ResetPage>['data'] = signedOut) {
  render(ResetPage, { data });
  await fireEvent.input(screen.getByLabelText('New password'), { target: { value: NEW_PASSWORD } });
  await fireEvent.input(screen.getByLabelText('Confirm password'), { target: { value: NEW_PASSWORD } });
  await fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
}

beforeEach(() => {
  authClient.resetPassword.mockReset();
  authClient.signOut.mockReset().mockResolvedValue({ data: { success: true }, error: null });
  vi.mocked(goto).mockReset();
});

afterEach(cleanup);

describe('the sign-out note', () => {
  it('tells a signed-in browser with a link that resetting signs it out everywhere', () => {
    render(ResetPage, { data: signedIn });

    expect(screen.getByText(SIGN_OUT_NOTE)).toBeTruthy();
  });

  it('is not shown to a signed-out browser', () => {
    render(ResetPage, { data: signedOut });

    expect(screen.queryByText(SIGN_OUT_NOTE)).toBeNull();
  });

  it('is not shown to a signed-in browser whose link did not work', () => {
    render(ResetPage, { data: { ...signedIn, token: null, linkError: 'INVALID_TOKEN' } });

    expect(screen.getByText('That link did not work')).toBeTruthy();
    expect(screen.queryByText(SIGN_OUT_NOTE)).toBeNull();
  });
});

describe('completing a password reset', () => {
  it('sends the browser, now signed out, to sign in', async () => {
    authClient.resetPassword.mockResolvedValue({ data: { status: true }, error: null });

    await submitNewPassword();

    await waitFor(() => expect(goto).toHaveBeenCalledWith(AppRoute.LOGIN, { invalidateAll: true }));
    expect(authClient.resetPassword).toHaveBeenCalledWith({ newPassword: NEW_PASSWORD, token: 'link-token' });
  });

  it('signs this browser out before going to sign in, whichever account was signed in', async () => {
    authClient.resetPassword.mockResolvedValue({ data: { status: true }, error: null });

    await submitNewPassword(signedIn);

    await waitFor(() => expect(goto).toHaveBeenCalledWith(AppRoute.LOGIN, { invalidateAll: true }));
    expect(authClient.signOut).toHaveBeenCalledOnce();
    expect(authClient.signOut.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(goto).mock.invocationCallOrder[0]);
  });

  it('still reaches sign in when the session was already ended by the reset', async () => {
    authClient.resetPassword.mockResolvedValue({ data: { status: true }, error: null });
    authClient.signOut.mockResolvedValue({ data: null, error: { status: 401, message: 'Unauthorized' } });

    await submitNewPassword(signedIn);

    await waitFor(() => expect(goto).toHaveBeenCalledWith(AppRoute.LOGIN, { invalidateAll: true }));
  });

  it('still reaches sign in when signing out throws', async () => {
    authClient.resetPassword.mockResolvedValue({ data: { status: true }, error: null });
    authClient.signOut.mockRejectedValue(new TypeError('Failed to fetch'));

    await submitNewPassword(signedIn);

    await waitFor(() => expect(goto).toHaveBeenCalledWith(AppRoute.LOGIN, { invalidateAll: true }));
  });

  it('stays on the form, signed in, and shows why when the reset fails', async () => {
    authClient.resetPassword.mockResolvedValue({ data: null, error: { status: 400, message: 'Invalid token' } });

    await submitNewPassword(signedIn);

    expect(await screen.findByText('Invalid token')).toBeTruthy();
    expect(authClient.signOut).not.toHaveBeenCalled();
    expect(goto).not.toHaveBeenCalled();
  });
});
