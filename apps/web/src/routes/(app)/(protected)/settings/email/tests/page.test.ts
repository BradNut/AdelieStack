// @vitest-environment jsdom
import { AuthCallbackPath, type AuthedUser } from '@adelie/shared';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOT_FRESH } from '#lib/client/tests/fresh-session-fixtures.ts';

const authClient = vi.hoisted(() => ({ changeEmail: vi.fn() }));

vi.mock('#lib/auth-client.ts', () => ({ authClient }));

import { freshSession, ReauthOutcome } from '#lib/client/fresh-session.svelte.ts';
import EmailPage from '../+page.svelte';

const CURRENT_EMAIL = 'penguin@example.com';
const NEW_EMAIL = 'emperor@example.com';
const STARTED = { data: { status: true }, error: null };
const AUTHED_USER: AuthedUser = {
  id: 'user-1',
  email: CURRENT_EMAIL,
  name: 'Penguin',
  roles: [],
  emailVerified: true,
  twoFactorEnabled: false,
};

function mount() {
  return render(EmailPage, { data: { socialProviders: [], signUpEnabled: false, flash: undefined, authedUser: AUTHED_USER } });
}

async function submitNewEmail() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('New email'), NEW_EMAIL);
  await user.click(screen.getByRole('button', { name: 'Change email' }));
}

const expectedCall = { newEmail: NEW_EMAIL, callbackURL: AuthCallbackPath.EMAIL_CHANGED };

beforeEach(() => {
  authClient.changeEmail.mockReset().mockResolvedValue(STARTED);
  freshSession.settle(ReauthOutcome.DISMISSED);
});

afterEach(cleanup);

describe('email settings page', () => {
  it('starts the change from a fresh session without asking to sign in again', async () => {
    mount();

    await submitNewEmail();

    expect(await screen.findByTestId('email-change-pending')).toBeTruthy();
    expect(authClient.changeEmail).toHaveBeenCalledExactlyOnceWith(expectedCall);
    expect(freshSession.open).toBe(false);
  });

  it('asks a stale session to re-authenticate, then finishes the change', async () => {
    authClient.changeEmail.mockResolvedValueOnce(NOT_FRESH).mockResolvedValueOnce(STARTED);
    mount();

    await submitNewEmail();
    await waitFor(() => expect(freshSession.open).toBe(true));
    expect(screen.queryByTestId('email-change-pending')).toBeNull();
    freshSession.settle(ReauthOutcome.CONFIRMED);

    expect(await screen.findByTestId('email-change-pending')).toBeTruthy();
    expect(authClient.changeEmail).toHaveBeenCalledTimes(2);
    expect(authClient.changeEmail).toHaveBeenNthCalledWith(2, expectedCall);
  });

  it('does not start the change when a stale session dismisses the prompt', async () => {
    authClient.changeEmail.mockResolvedValue(NOT_FRESH);
    mount();

    await submitNewEmail();
    await waitFor(() => expect(freshSession.open).toBe(true));
    freshSession.settle(ReauthOutcome.DISMISSED);

    expect(await screen.findByText(NOT_FRESH.error.message)).toBeTruthy();
    expect(screen.queryByTestId('email-change-pending')).toBeNull();
    expect(authClient.changeEmail).toHaveBeenCalledOnce();
  });

  it('shows any other refusal without asking to sign in again', async () => {
    authClient.changeEmail.mockResolvedValue({ data: null, error: { status: 400, message: 'Email is the same' } });
    mount();

    await submitNewEmail();

    expect(await screen.findByText('Email is the same')).toBeTruthy();
    expect(freshSession.open).toBe(false);
    expect(screen.queryByTestId('email-change-pending')).toBeNull();
  });
});
