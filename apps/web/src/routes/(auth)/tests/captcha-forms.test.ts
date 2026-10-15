// @vitest-environment jsdom
import { CAPTCHA_RESPONSE_HEADER, CAPTCHA_UNAVAILABLE, CAPTCHA_VERIFICATION_FAILED, CaptchaProvider, type CaptchaPublicConfig } from '@adelie/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authClient = vi.hoisted(() => ({
  signIn: { email: vi.fn(), passkey: vi.fn() },
  signUp: { email: vi.fn() },
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));
const getCaptchaConfig = vi.fn<() => Promise<CaptchaPublicConfig>>();
const widget = { reset: vi.fn(), destroy: vi.fn() };
const renderWidget = vi.fn();

vi.mock('#lib/auth-client.ts', () => ({ authClient }));
vi.mock('#lib/client/captcha/config.ts', () => ({ getCaptchaConfig: () => getCaptchaConfig() }));
vi.mock('#lib/client/captcha/widgets.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/client/captcha/widgets.ts')>()),
  captchaWidgetFor: (provider: string) => ({ provider, render: renderWidget }),
}));
vi.mock('#lib/client/auth-form.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/client/auth-form.ts')>()),
  refreshSession: vi.fn(),
}));
vi.mock('mode-watcher', () => ({ mode: { current: 'light' } }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from 'svelte-sonner';
import ResendVerificationButton from '#lib/components/auth/resend-verification-button.svelte';
import LoginPage from '../login/+page.svelte';
import ResetPage from '../password/reset/+page.svelte';
import SignupPage from '../signup/+page.svelte';

const ENABLED = { enabled: true, provider: CaptchaProvider.TURNSTILE, siteKey: 'site' } as const;
const TOKEN = 'widget-token';

beforeEach(() => {
  for (const fn of [
    widget.reset,
    widget.destroy,
    renderWidget,
    ...Object.values(authClient.signIn),
    authClient.signUp.email,
    authClient.requestPasswordReset,
    authClient.sendVerificationEmail,
  ]) {
    fn.mockReset();
  }
  renderWidget.mockResolvedValue(widget);
  getCaptchaConfig.mockResolvedValue({ enabled: false });
  for (const call of [authClient.signIn.email, authClient.signUp.email, authClient.requestPasswordReset, authClient.sendVerificationEmail]) {
    call.mockResolvedValue({ data: {}, error: null });
  }
});

afterEach(cleanup);

/** Waits for the widget to render, then plays the part of the provider handing back a token. */
async function solveCaptcha() {
  await waitFor(() => expect(renderWidget).toHaveBeenCalled());
  renderWidget.mock.calls.at(-1)?.[1].onToken(TOKEN);
}

async function type(label: RegExp | string, value: string) {
  await fireEvent.input(screen.getAllByLabelText(label)[0] as HTMLElement, { target: { value } });
}

const forms = [
  {
    name: 'sign-in',
    mount: () => render(LoginPage, { data: { signUpEnabled: true, flash: undefined, authedUser: null, socialProviders: [] } }),
    fill: async () => {
      await type('Email', 'a@example.com');
      await type('Password', 'correct horse battery');
    },
    submit: () => fireEvent.click(screen.getByRole('button', { name: 'Login' })),
    call: () => authClient.signIn.email,
  },
  {
    name: 'sign-up',
    mount: () => render(SignupPage, { data: { signUpEnabled: true, socialProviders: [], flash: undefined, authedUser: null } }),
    fill: async () => {
      await type('Name', 'Ada');
      await type('Email', 'a@example.com');
      await type(/^Password$/, 'correct horse battery');
      await type('Confirm Password', 'correct horse battery');
    },
    submit: () => fireEvent.click(screen.getByRole('button', { name: 'Signup' })),
    call: () => authClient.signUp.email,
  },
  {
    name: 'request-password-reset',
    mount: () =>
      render(ResetPage, { data: { signUpEnabled: true, socialProviders: [], flash: undefined, authedUser: null, token: null, linkError: null } }),
    fill: () => type('Email', 'a@example.com'),
    submit: () => fireEvent.click(screen.getByRole('button', { name: 'Send reset link' })),
    call: () => authClient.requestPasswordReset,
  },
];

describe.each(forms)('$name form', ({ mount, fill, submit, call }) => {
  it('shows no widget and sends no token when captcha is disabled', async () => {
    mount();
    await fill();
    await submit();

    await waitFor(() => expect(call()).toHaveBeenCalled());
    expect(screen.queryByTestId('captcha-widget')).toBeNull();
    expect(call().mock.calls[0]?.[1]).toEqual({});
  });

  it('renders the widget and sends the token in the captcha header when enabled', async () => {
    getCaptchaConfig.mockResolvedValue(ENABLED);
    mount();
    expect(await screen.findByTestId('captcha-widget')).toBeTruthy();
    await solveCaptcha();
    await fill();
    await submit();

    await waitFor(() => expect(call()).toHaveBeenCalled());
    expect(call().mock.calls[0]?.[1]).toEqual({ headers: { [CAPTCHA_RESPONSE_HEADER]: TOKEN } });
  });

  it('starts a new challenge after the attempt, because the token is single-use', async () => {
    getCaptchaConfig.mockResolvedValue(ENABLED);
    mount();
    await solveCaptcha();
    await fill();
    await submit();

    await waitFor(() => expect(widget.reset).toHaveBeenCalled());
  });

  it.each([
    [CAPTCHA_VERIFICATION_FAILED, 'Invalid captcha, please try again.'],
    [CAPTCHA_UNAVAILABLE, 'Captcha is temporarily unavailable. Please try again later.'],
  ])('shows the translated message for %s', async (code, text) => {
    getCaptchaConfig.mockResolvedValue(ENABLED);
    call().mockResolvedValue({ data: null, error: { code, message: 'raw server text' } });
    mount();
    await solveCaptcha();
    await fill();
    await submit();

    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByText('raw server text')).toBeNull();
  });
});

describe('resend verification button', () => {
  it('renders the widget when enabled and sends the token', async () => {
    getCaptchaConfig.mockResolvedValue(ENABLED);
    render(ResendVerificationButton, { email: 'a@example.com' });
    expect(await screen.findByTestId('captcha-widget')).toBeTruthy();
    await solveCaptcha();
    await fireEvent.click(screen.getByTestId('resend-verification'));

    await waitFor(() => expect(authClient.sendVerificationEmail).toHaveBeenCalled());
    expect(authClient.sendVerificationEmail.mock.calls[0]?.[1]).toEqual({ headers: { [CAPTCHA_RESPONSE_HEADER]: TOKEN } });
    expect(widget.reset).toHaveBeenCalled();
  });

  it('shows no widget and sends no token when disabled', async () => {
    render(ResendVerificationButton, { email: 'a@example.com' });
    await fireEvent.click(screen.getByTestId('resend-verification'));

    await waitFor(() => expect(authClient.sendVerificationEmail).toHaveBeenCalled());
    expect(screen.queryByTestId('captcha-widget')).toBeNull();
    expect(authClient.sendVerificationEmail.mock.calls[0]?.[1]).toEqual({});
  });

  it('toasts the translated outage message', async () => {
    getCaptchaConfig.mockResolvedValue(ENABLED);
    authClient.sendVerificationEmail.mockResolvedValue({ data: null, error: { code: CAPTCHA_UNAVAILABLE, message: 'raw' } });
    render(ResendVerificationButton, { email: 'a@example.com' });
    await solveCaptcha();
    await fireEvent.click(screen.getByTestId('resend-verification'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Captcha is temporarily unavailable. Please try again later.'));
  });
});
