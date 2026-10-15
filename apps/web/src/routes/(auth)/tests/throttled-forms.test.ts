// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authClient = vi.hoisted(() => ({
  signIn: { email: vi.fn(), passkey: vi.fn() },
  twoFactor: { verifyTotp: vi.fn(), verifyOtp: vi.fn(), verifyBackupCode: vi.fn(), sendOtp: vi.fn() },
  requestPasswordReset: vi.fn(),
  getLastUsedLoginMethod: vi.fn(() => null),
}));

vi.mock('#lib/auth-client.ts', () => ({ authClient }));
vi.mock('#lib/client/captcha/config.ts', () => ({ getCaptchaConfig: async () => ({ enabled: false }) }));
vi.mock('#lib/client/auth-form.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/client/auth-form.ts')>()),
  refreshSession: vi.fn(),
}));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from 'svelte-sonner';
import LoginPage from '../login/+page.svelte';
import TwoFactorPage from '../login/two-factor/+page.svelte';
import ResetPage from '../password/reset/+page.svelte';

const THROTTLED = { data: null, error: { status: 429, message: 'Too many requests. Please try again later.', retryAfter: 42 } };
const WAIT_TEXT = 'Too many attempts. Please try again in 42 seconds.';
const FAILED = { data: null, error: { status: 401, message: 'Invalid credentials from server' } };
const OK = { data: {}, error: null };

async function type(label: RegExp | string, value: string) {
  await fireEvent.input(screen.getAllByLabelText(label)[0] as HTMLElement, { target: { value } });
}

const loginData = { signUpEnabled: true, flash: undefined, authedUser: null, showOAuthButtons: false };
const resetData = { signUpEnabled: true, flash: undefined, authedUser: null, token: null, linkError: null };

// Each form field-error case: fill, submit, and the mock that the submit calls.
const fieldForms = [
  {
    name: 'sign-in',
    mount: () => render(LoginPage, { data: loginData }),
    submit: async () => {
      await type('Email', 'a@example.com');
      await type('Password', 'correct horse battery');
      await fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    },
    call: () => authClient.signIn.email,
  },
  {
    name: 'password reset request',
    mount: () => render(ResetPage, { data: resetData }),
    submit: async () => {
      await type('Email', 'a@example.com');
      await fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    },
    call: () => authClient.requestPasswordReset,
  },
  {
    name: 'two-factor authenticator code',
    mount: () => render(TwoFactorPage),
    submit: async () => {
      await type('Authenticator code', '123456');
      await fireEvent.click(screen.getAllByRole('button', { name: 'Verify' })[0] as HTMLElement);
    },
    call: () => authClient.twoFactor.verifyTotp,
  },
];

beforeEach(() => {
  for (const fn of [
    authClient.signIn.email,
    authClient.signIn.passkey,
    ...Object.values(authClient.twoFactor),
    authClient.requestPasswordReset,
    vi.mocked(toast.error),
  ]) {
    fn.mockReset();
  }
});

afterEach(cleanup);

describe.each(fieldForms)('$name form', ({ mount, submit, call }) => {
  it('shows the translated wait when throttled', async () => {
    call().mockResolvedValue(THROTTLED);
    mount();
    await submit();

    expect(await screen.findByText(WAIT_TEXT)).toBeTruthy();
    expect(screen.queryByText(THROTTLED.error.message)).toBeNull();
  });

  it('shows the server message, not the throttle text, for another failure', async () => {
    call().mockResolvedValue(FAILED);
    mount();
    await submit();

    expect(await screen.findByText('Invalid credentials from server')).toBeTruthy();
    expect(screen.queryByText(/Too many attempts/)).toBeNull();
  });

  it('stays usable and clears the message on the next attempt', async () => {
    call().mockResolvedValueOnce(THROTTLED).mockResolvedValue(FAILED);
    mount();
    await submit();
    await screen.findByText(WAIT_TEXT);

    await submit();

    await waitFor(() => expect(call()).toHaveBeenCalledTimes(2));
    await screen.findByText('Invalid credentials from server');
    expect(screen.queryByText(WAIT_TEXT)).toBeNull();
  });
});

describe('two-factor recovery code form', () => {
  it('shows the translated wait when throttled', async () => {
    authClient.twoFactor.verifyBackupCode.mockResolvedValue(THROTTLED);
    render(TwoFactorPage);
    await fireEvent.click(screen.getByRole('tab', { name: 'Recovery' }));
    await type('Recovery code', 'abcde-fghij');
    await fireEvent.click(screen.getByRole('button', { name: 'Use recovery code' }));

    expect(await screen.findByText(WAIT_TEXT)).toBeTruthy();
  });
});

describe('two-factor emailed code', () => {
  beforeEach(() => authClient.twoFactor.sendOtp.mockReset());

  it('toasts the translated wait when sending the code is throttled', async () => {
    authClient.twoFactor.sendOtp.mockResolvedValue(THROTTLED);
    render(TwoFactorPage);
    await fireEvent.click(screen.getByRole('tab', { name: 'Email' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(WAIT_TEXT));
  });

  it('keeps the button usable after a throttle', async () => {
    authClient.twoFactor.sendOtp.mockResolvedValueOnce(THROTTLED).mockResolvedValue(OK);
    render(TwoFactorPage);
    await fireEvent.click(screen.getByRole('tab', { name: 'Email' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));

    await waitFor(() => expect(screen.getByLabelText('Emailed code')).toBeTruthy());
  });
});

describe('passkey sign-in', () => {
  const passkey = () => fireEvent.click(screen.getByRole('button', { name: /Sign in with a passkey/ }));

  it('toasts the translated wait when throttled', async () => {
    authClient.signIn.passkey.mockResolvedValue(THROTTLED);
    render(LoginPage, { data: loginData });
    await passkey();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(WAIT_TEXT));
  });

  it('toasts the server message for another failure', async () => {
    authClient.signIn.passkey.mockResolvedValue(FAILED);
    render(LoginPage, { data: loginData });
    await passkey();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid credentials from server'));
  });
});
