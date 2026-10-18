// @vitest-environment jsdom
import { CAPTCHA_RESPONSE_HEADER, CAPTCHA_UNAVAILABLE, CAPTCHA_VERIFICATION_FAILED, CaptchaProvider, StatusCodes } from '@adelie/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authPath, stubFetch } from '#lib/client/tests/fetch-stub.ts';

const widget = { reset: vi.fn(), destroy: vi.fn() };
const renderWidget = vi.fn();

// The real auth client runs, so its captcha binding guard checks every protected call; only the network and the
// Captcha Provider widget are stubbed.
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

let network: ReturnType<typeof stubFetch>;

beforeEach(() => {
  network = stubFetch();
  widget.reset.mockReset();
  widget.destroy.mockReset();
  renderWidget.mockReset().mockResolvedValue(widget);
  vi.mocked(toast.error).mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Waits for the widget to render, then plays the part of the provider handing back a token. */
async function solveCaptcha() {
  await waitFor(() => expect(renderWidget).toHaveBeenCalled());
  renderWidget.mock.calls.at(-1)?.[1].onToken(TOKEN);
}

async function type(label: RegExp | string, value: string) {
  await fireEvent.input(screen.getAllByLabelText(label)[0] as HTMLElement, { target: { value } });
}

/** The requests that reached the network for a Better Auth endpoint, after the binding guard let them through. */
const sentTo = (endpoint: string) => network.sent(authPath(endpoint));

const forms = [
  {
    name: 'sign-in',
    mount: () => render(LoginPage, { data: { signUpEnabled: true, flash: undefined, authedUser: null, socialProviders: [] } }),
    fill: async () => {
      await type('Email', 'a@example.com');
      await type('Password', 'correct horse battery');
    },
    submit: () => fireEvent.click(screen.getByRole('button', { name: 'Login' })),
    endpoint: '/sign-in/email',
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
    endpoint: '/sign-up/email',
  },
  {
    name: 'request-password-reset',
    mount: () =>
      render(ResetPage, { data: { signUpEnabled: true, socialProviders: [], flash: undefined, authedUser: null, token: null, linkError: null } }),
    fill: () => type('Email', 'a@example.com'),
    submit: () => fireEvent.click(screen.getByRole('button', { name: 'Send reset link' })),
    endpoint: '/request-password-reset',
  },
];

describe.each(forms)('$name form', ({ mount, fill, submit, endpoint }) => {
  it('shows no widget and sends no Captcha Token when captcha is disabled', async () => {
    mount();
    await fill();
    await submit();

    await waitFor(() => expect(sentTo(endpoint)).toHaveLength(1));
    expect(screen.queryByTestId('captcha-widget')).toBeNull();
    expect(sentTo(endpoint)[0]?.headers.has(CAPTCHA_RESPONSE_HEADER)).toBe(false);
  });

  it('renders the widget when config reports captcha enabled, and sends its token', async () => {
    network.captcha(ENABLED);
    mount();
    expect(await screen.findByTestId('captcha-widget')).toBeTruthy();
    await solveCaptcha();
    await fill();
    await submit();

    await waitFor(() => expect(sentTo(endpoint)).toHaveLength(1));
    expect(sentTo(endpoint)[0]?.headers.get(CAPTCHA_RESPONSE_HEADER)).toBe(TOKEN);
  });

  it('starts a new challenge after the attempt, because the token is single-use', async () => {
    network.captcha(ENABLED);
    mount();
    await solveCaptcha();
    await fill();
    await submit();

    await waitFor(() => expect(widget.reset).toHaveBeenCalled());
  });

  it.each([
    [CAPTCHA_VERIFICATION_FAILED, StatusCodes.FORBIDDEN, 'Invalid captcha, please try again.'],
    [CAPTCHA_UNAVAILABLE, StatusCodes.SERVICE_UNAVAILABLE, 'Captcha is temporarily unavailable. Please try again later.'],
  ])('shows the translated message for %s', async (code, status, text) => {
    network.captcha(ENABLED);
    network.reply(authPath(endpoint), { status, body: { code, message: 'raw server text' } });
    mount();
    await solveCaptcha();
    await fill();
    await submit();

    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByText('raw server text')).toBeNull();
    expect(widget.reset).toHaveBeenCalled();
  });
});

describe('resend verification button', () => {
  const ENDPOINT = '/send-verification-email';

  it('renders the widget when enabled and sends the token', async () => {
    network.captcha(ENABLED);
    render(ResendVerificationButton, { email: 'a@example.com' });
    expect(await screen.findByTestId('captcha-widget')).toBeTruthy();
    await solveCaptcha();
    await fireEvent.click(screen.getByTestId('resend-verification'));

    await waitFor(() => expect(sentTo(ENDPOINT)).toHaveLength(1));
    expect(sentTo(ENDPOINT)[0]?.headers.get(CAPTCHA_RESPONSE_HEADER)).toBe(TOKEN);
    await waitFor(() => expect(widget.reset).toHaveBeenCalled());
  });

  it('shows no widget and sends no Captcha Token when disabled', async () => {
    render(ResendVerificationButton, { email: 'a@example.com' });
    await fireEvent.click(screen.getByTestId('resend-verification'));

    await waitFor(() => expect(sentTo(ENDPOINT)).toHaveLength(1));
    expect(screen.queryByTestId('captcha-widget')).toBeNull();
    expect(sentTo(ENDPOINT)[0]?.headers.has(CAPTCHA_RESPONSE_HEADER)).toBe(false);
  });

  it('toasts the translated outage message', async () => {
    network.captcha(ENABLED);
    network.reply(authPath(ENDPOINT), { status: StatusCodes.SERVICE_UNAVAILABLE, body: { code: CAPTCHA_UNAVAILABLE, message: 'raw' } });
    render(ResendVerificationButton, { email: 'a@example.com' });
    await solveCaptcha();
    await fireEvent.click(screen.getByTestId('resend-verification'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Captcha is temporarily unavailable. Please try again later.'));
  });
});
