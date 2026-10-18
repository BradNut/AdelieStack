// @vitest-environment jsdom
import {
  AuthErrorCode,
  CAPTCHA_MISSING_RESPONSE,
  CAPTCHA_RESPONSE_HEADER,
  CAPTCHA_UNAVAILABLE,
  CAPTCHA_VERIFICATION_FAILED,
  CaptchaProvider,
  CREDENTIAL_PROVIDER_ID,
  RETRY_AFTER_HEADER,
  SocialProvider,
  StatusCodes,
} from '@adelie/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authPath, stubFetch } from '#lib/client/tests/fetch-stub.ts';
import { CAPTCHA_BINDING_HEADER } from '#lib/constants/captcha.ts';

const credentialsGet = vi.fn();
const widget = { reset: vi.fn(), destroy: vi.fn() };
const renderWidget = vi.fn();

// The network, the WebAuthn browser API and the Captcha Provider widget are the only stand-ins; the real auth client runs.
vi.mock('#lib/client/captcha/widgets.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/client/captcha/widgets.ts')>()),
  captchaWidgetFor: (provider: string) => ({ provider, render: renderWidget }),
}));
vi.mock('mode-watcher', () => ({ mode: { current: 'light' } }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));
// Leaving for the provider is a full-page navigation, which jsdom cannot perform.
const redirectBrowser = vi.hoisted(() => vi.fn());
vi.mock('#lib/client/browser-redirect.ts', () => ({ redirectBrowser }));

import { freshSession, ReauthOutcome, withFreshSession } from '#lib/client/fresh-session.svelte.ts';
import { PENDING_REAUTH_STORAGE_KEY, ReplayActionKey } from '#lib/client/reauth-replay.svelte.ts';
import { page } from '$app/state';
import ReauthDialog from '../reauth-dialog.svelte';

const USER = { id: 'u1', email: 'a@example.com', twoFactorEnabled: false };
const ENABLED = { enabled: true, provider: CaptchaProvider.TURNSTILE, siteKey: 'site' } as const;
const TOKEN = 'widget-token';
const SIGN_IN = authPath('/sign-in/email');
const PASSKEY_VERIFY = authPath('/passkey/verify-authentication');

const THROTTLED = { status: StatusCodes.TOO_MANY_REQUESTS, body: { message: 'Too many requests' }, headers: { [RETRY_AFTER_HEADER]: '42' } };

let network: ReturnType<typeof stubFetch>;

/** What `navigator.credentials.get` resolves with when the user approves a passkey. */
const ASSERTION = {
  id: 'pk',
  rawId: new ArrayBuffer(1),
  type: 'public-key',
  response: { authenticatorData: new ArrayBuffer(1), clientDataJSON: new ArrayBuffer(1), signature: new ArrayBuffer(1), userHandle: null },
  getClientExtensionResults: () => ({}),
  authenticatorAttachment: 'platform',
};

function stubWebAuthn() {
  vi.stubGlobal('PublicKeyCredential', class {});
  // jsdom has no `navigator.credentials`.
  Object.defineProperty(navigator, 'credentials', { value: { get: credentialsGet }, configurable: true });
  credentialsGet.mockReset().mockResolvedValue(ASSERTION);
}

function setup({ user = USER, accounts = [{ providerId: CREDENTIAL_PROVIDER_ID }], passkeys = [] as unknown[] } = {}) {
  network.reply(authPath('/get-session'), { body: { user, session: { id: 's1' } } });
  network.reply(authPath('/list-accounts'), { body: accounts });
  network.reply(authPath('/passkey/list-user-passkeys'), { body: passkeys });
  network.reply(authPath('/passkey/generate-authenticate-options'), { body: { challenge: 'Y2hhbGxlbmdl' } });
}

function open() {
  render(ReauthDialog);
  return freshSession.request();
}

/** Waits for the widget to render, then plays the part of the provider handing back a token. */
async function solveCaptcha() {
  await waitFor(() => expect(renderWidget).toHaveBeenCalled());
  renderWidget.mock.calls.at(-1)?.[1].onToken(TOKEN);
}

async function confirmPassword(value = 'Correct-Horse-9') {
  await fireEvent.input(await screen.findByLabelText('Password'), { target: { value } });
  await fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
}

beforeEach(() => {
  freshSession.settle(ReauthOutcome.DISMISSED);
  network = stubFetch();
  widget.reset.mockReset();
  widget.destroy.mockReset();
  renderWidget.mockReset().mockResolvedValue(widget);
  stubWebAuthn();
  sessionStorage.clear();
  redirectBrowser.mockReset();
  page.data = { socialProviders: [] };
  setup();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ReauthDialog', () => {
  it('stays closed until a stale session asks for it', () => {
    render(ReauthDialog);

    expect(screen.queryByTestId('reauth-dialog')).toBeNull();
  });

  it('signs in again with the typed password and confirms', async () => {
    const outcome = open();

    await confirmPassword();

    expect(await outcome).toBe(ReauthOutcome.CONFIRMED);
    expect(network.sent(SIGN_IN).map((request) => request.body)).toEqual([
      expect.objectContaining({ email: 'a@example.com', password: 'Correct-Horse-9' }),
    ]);
  });

  it('keeps the dialog open with a translated error on a wrong password', async () => {
    network.reply(SIGN_IN, { status: StatusCodes.UNAUTHORIZED, body: { message: 'Invalid email or password' } });
    const outcome = open();
    const settled = vi.fn();
    outcome.then(settled);

    await confirmPassword('nope');

    expect((await screen.findByTestId('reauth-error')).textContent).toBe('Password is incorrect.');
    expect(freshSession.open).toBe(true);
    expect(settled).not.toHaveBeenCalled();
  });

  it.each([
    ['off', false],
    ['on', true],
  ])('shows the throttled message when password sign-in is rate limited with captcha %s', async (_name, captchaOn) => {
    if (captchaOn) network.captcha(ENABLED);
    network.reply(SIGN_IN, THROTTLED);
    open();
    if (captchaOn) await solveCaptcha();

    await confirmPassword();

    expect((await screen.findByTestId('reauth-error')).textContent).toBe('Too many attempts. Please try again in 42 seconds.');
  });

  it('does not confirm when password sign-in answers with a two-factor challenge', async () => {
    network.reply(SIGN_IN, { body: { twoFactorRedirect: true } });
    const outcome = open();
    const settled = vi.fn();
    outcome.then(settled);

    await confirmPassword();

    expect((await screen.findByTestId('reauth-error')).textContent).toBe('Sign out and sign in again to continue.');
    expect(settled).not.toHaveBeenCalled();
  });

  it('falls back to sign out and in when the lookup fails', async () => {
    network.reply(authPath('/list-accounts'), { status: StatusCodes.INTERNAL_SERVER_ERROR, body: { message: 'offline' } });
    open();

    expect((await screen.findByTestId('reauth-fallback')).textContent).toBe('Sign out and sign in again to continue.');
  });

  it('resolves as dismissed on cancel', async () => {
    const outcome = open();

    await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(await outcome).toBe(ReauthOutcome.DISMISSED);
    expect(network.sent(SIGN_IN)).toEqual([]);
  });

  it('offers a passkey when the user has one, and confirms with it', async () => {
    setup({ passkeys: [{ id: 'pk' }] });
    const outcome = open();

    await fireEvent.click(await screen.findByRole('button', { name: 'Use a passkey' }));

    expect(await outcome).toBe(ReauthOutcome.CONFIRMED);
    expect(network.sent(PASSKEY_VERIFY)).toHaveLength(1);
  });

  it('offers only a passkey to a user without a password', async () => {
    setup({ accounts: [{ providerId: 'github' }], passkeys: [{ id: 'pk' }] });
    open();

    await screen.findByRole('button', { name: 'Use a passkey' });
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('shows an error and stays open when the passkey fails', async () => {
    setup({ passkeys: [{ id: 'pk' }] });
    credentialsGet.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'));
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

  describe('with linked social providers', () => {
    const GITHUB = { providerId: SocialProvider.GITHUB };
    const GOOGLE = { providerId: SocialProvider.GOOGLE };

    it('offers a button for each linked provider that is still enabled, next to the password form', async () => {
      page.data = { socialProviders: [SocialProvider.GITHUB, SocialProvider.GOOGLE] };
      setup({ accounts: [{ providerId: CREDENTIAL_PROVIDER_ID }, GITHUB, GOOGLE] });
      open();

      expect(await screen.findByRole('button', { name: 'Continue with GitHub' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
      expect(screen.getByLabelText('Password')).toBeTruthy();
      expect(screen.queryByTestId('reauth-fallback')).toBeNull();
    });

    it('hides a provider that was disabled since it was linked', async () => {
      page.data = { socialProviders: [SocialProvider.GITHUB] };
      setup({ accounts: [GITHUB, GOOGLE] });
      open();

      await screen.findByRole('button', { name: 'Continue with GitHub' });
      expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    });

    it('hides an enabled provider the user never linked', async () => {
      page.data = { socialProviders: [SocialProvider.GITHUB, SocialProvider.GOOGLE] };
      setup({ accounts: [GITHUB] });
      open();

      await screen.findByRole('button', { name: 'Continue with GitHub' });
      expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    });

    it('offers the provider to a two-factor user, who has no password option', async () => {
      page.data = { socialProviders: [SocialProvider.GITHUB] };
      setup({ user: { ...USER, twoFactorEnabled: true }, accounts: [GITHUB] });
      open();

      await screen.findByRole('button', { name: 'Continue with GitHub' });
      expect(screen.queryByLabelText('Password')).toBeNull();
    });

    describe('choosing a provider', () => {
      const SIGN_IN_SOCIAL = authPath('/sign-in/social');
      const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize?client_id=abc&state=xyz';
      const NOT_FRESH = { data: null, error: { status: 403, code: AuthErrorCode.SESSION_NOT_FRESH, message: 'Session is not fresh' } };
      const unlinkGithub = { key: ReplayActionKey.UNLINK_ACCOUNT, args: { accountId: 'acc-gh' } } as const;

      /** Opens the dialog the way a stale action does, then clicks the GitHub button. */
      async function chooseGithub(replay?: typeof unlinkGithub) {
        page.data = { socialProviders: [SocialProvider.GITHUB] };
        setup({ accounts: [GITHUB] });
        network.reply(SIGN_IN_SOCIAL, { body: { url: AUTHORIZE_URL, redirect: false } });
        withFreshSession(() => Promise.resolve(NOT_FRESH), replay);
        render(ReauthDialog);
        await fireEvent.click(await screen.findByRole('button', { name: 'Continue with GitHub' }));
      }

      beforeEach(() => {
        window.history.replaceState({}, '', '/settings/connected-accounts?tab=1&error=access_denied');
      });

      it('asks the provider to re-authenticate, hinting the email, and returns to the current page', async () => {
        await chooseGithub(unlinkGithub);
        await waitFor(() => expect(redirectBrowser).toHaveBeenCalledOnce());

        const [request] = network.sent(SIGN_IN_SOCIAL);
        expect(request?.body).toEqual(
          expect.objectContaining({
            provider: 'github',
            loginHint: 'a@example.com',
            callbackURL: '/settings/connected-accounts?tab=1',
            errorCallbackURL: '/settings/connected-accounts?tab=1',
          }),
        );
        const target = new URL(redirectBrowser.mock.calls[0]?.[0]);
        expect(target.origin + target.pathname).toBe('https://github.com/login/oauth/authorize');
        expect(target.searchParams.get('prompt')).toBe('select_account');
        expect(target.searchParams.get('state')).toBe('xyz');
      });

      it('persists the action, its arguments, the user id and a timestamp before leaving, and nothing secret', async () => {
        const before = Date.now();
        await chooseGithub(unlinkGithub);
        await waitFor(() => expect(redirectBrowser).toHaveBeenCalled());

        const stored = JSON.parse(sessionStorage.getItem(PENDING_REAUTH_STORAGE_KEY) ?? 'null');
        expect(stored).toEqual({ action: { key: 'unlink-account', args: { accountId: 'acc-gh' } }, userId: 'u1', at: expect.any(Number) });
        expect(stored.at).toBeGreaterThanOrEqual(before);
        expect(sessionStorage.length).toBe(1);
      });

      it('persists no action when the stale call is not replayable', async () => {
        await chooseGithub();
        await waitFor(() => expect(redirectBrowser).toHaveBeenCalled());

        expect(JSON.parse(sessionStorage.getItem(PENDING_REAUTH_STORAGE_KEY) ?? 'null')).toEqual({
          action: null,
          userId: 'u1',
          at: expect.any(Number),
        });
      });

      it('shows the error, stores nothing and does not leave when the provider cannot be started', async () => {
        page.data = { socialProviders: [SocialProvider.GITHUB] };
        setup({ accounts: [GITHUB] });
        network.reply(SIGN_IN_SOCIAL, { status: StatusCodes.BAD_REQUEST, body: { message: 'Provider not found' } });
        withFreshSession(() => Promise.resolve(NOT_FRESH), unlinkGithub);
        render(ReauthDialog);

        await fireEvent.click(await screen.findByRole('button', { name: 'Continue with GitHub' }));

        expect((await screen.findByTestId('reauth-error')).textContent).toBe('Sign-in with the provider failed. Please try again.');
        expect(sessionStorage.getItem(PENDING_REAUTH_STORAGE_KEY)).toBeNull();
        expect(redirectBrowser).not.toHaveBeenCalled();
        expect(freshSession.open).toBe(true);
      });

      it('leaves storage untouched when the dialog is dismissed', async () => {
        page.data = { socialProviders: [SocialProvider.GITHUB] };
        setup({ accounts: [GITHUB] });
        const result = withFreshSession(() => Promise.resolve(NOT_FRESH), unlinkGithub);
        render(ReauthDialog);

        await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

        expect(await result).toBe(NOT_FRESH);
        expect(sessionStorage.length).toBe(0);
        expect(network.sent(SIGN_IN_SOCIAL)).toEqual([]);
      });
    });

    it('keeps the sign-out fallback when the only linked provider is disabled', async () => {
      setup({ accounts: [GITHUB] });
      open();

      expect((await screen.findByTestId('reauth-fallback')).textContent).toBe('Sign out and sign in again to continue.');
    });
  });

  describe('with captcha on', () => {
    beforeEach(() => {
      network.captcha(ENABLED);
    });

    it('binds the Captcha Token to password confirmation and confirms', async () => {
      const outcome = open();
      await solveCaptcha();

      await confirmPassword();

      expect(await outcome).toBe(ReauthOutcome.CONFIRMED);
      const [request] = network.sent(SIGN_IN);
      expect(request?.headers.get(CAPTCHA_RESPONSE_HEADER)).toBe(TOKEN);
      // The binding guard requires the marker and strips it before the request leaves.
      expect(request?.headers.has(CAPTCHA_BINDING_HEADER)).toBe(false);
    });

    it.each([
      [CAPTCHA_MISSING_RESPONSE, StatusCodes.BAD_REQUEST, 'Invalid captcha, please try again.'],
      [CAPTCHA_VERIFICATION_FAILED, StatusCodes.FORBIDDEN, 'Invalid captcha, please try again.'],
      [CAPTCHA_UNAVAILABLE, StatusCodes.SERVICE_UNAVAILABLE, 'Captcha is temporarily unavailable. Please try again later.'],
    ])('shows the captcha message for %s, not "password incorrect"', async (code, status, text) => {
      network.reply(SIGN_IN, { status, body: { code, message: 'raw server text' } });
      open();
      await solveCaptcha();

      await confirmPassword();

      expect((await screen.findByTestId('reauth-error')).textContent).toBe(text);
      expect(freshSession.open).toBe(true);
    });

    it.each([
      ['a successful', {}],
      ['a failed', { status: StatusCodes.UNAUTHORIZED, body: { message: 'Invalid email or password' } }],
    ])('starts a new challenge after %s attempt, because the token is single-use', async (_name, reply) => {
      network.reply(SIGN_IN, reply);
      open();
      await solveCaptcha();

      await confirmPassword();

      await waitFor(() => expect(widget.reset).toHaveBeenCalledOnce());
    });

    it('renders a fresh challenge on each opening and tears it down on close', async () => {
      open();
      await solveCaptcha();

      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(widget.destroy).toHaveBeenCalledOnce());

      freshSession.request();
      await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(2));
    });

    it('shows no challenge for passkey-only confirmation', async () => {
      setup({ accounts: [{ providerId: 'github' }], passkeys: [{ id: 'pk' }] });
      const outcome = open();

      await fireEvent.click(await screen.findByRole('button', { name: 'Use a passkey' }));

      expect(await outcome).toBe(ReauthOutcome.CONFIRMED);
      expect(screen.queryByTestId('captcha-widget')).toBeNull();
      expect(renderWidget).not.toHaveBeenCalled();
    });

    it('sends no Captcha Token with passkey confirmation when the password form shows a challenge', async () => {
      setup({ passkeys: [{ id: 'pk' }] });
      const outcome = open();
      await solveCaptcha();

      await fireEvent.click(screen.getByRole('button', { name: 'Use a passkey' }));

      expect(await outcome).toBe(ReauthOutcome.CONFIRMED);
      expect(network.sent(PASSKEY_VERIFY)[0]?.headers.has(CAPTCHA_RESPONSE_HEADER)).toBe(false);
      expect(widget.reset).not.toHaveBeenCalled();
    });
  });
});
