// @vitest-environment jsdom
import {
  CAPTCHA_MISSING_RESPONSE,
  CAPTCHA_RESPONSE_HEADER,
  CAPTCHA_UNAVAILABLE,
  CAPTCHA_VERIFICATION_FAILED,
  CaptchaProvider,
  CREDENTIAL_PROVIDER_ID,
  RETRY_AFTER_HEADER,
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

import { freshSession, ReauthOutcome } from '#lib/client/fresh-session.svelte.ts';
import ReauthDialog from '../reauth-dialog.svelte';

const USER = { id: 'u1', email: 'a@example.com', twoFactorEnabled: false };
const ENABLED = { enabled: true, provider: CaptchaProvider.TURNSTILE, siteKey: 'site' } as const;
const TOKEN = 'widget-token';
const SIGN_IN = authPath('/sign-in/email');
const PASSKEY_VERIFY = authPath('/passkey/verify-authentication');

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

  it('shows the throttled message when password sign-in is rate limited', async () => {
    network.reply(SIGN_IN, {
      status: StatusCodes.TOO_MANY_REQUESTS,
      body: { message: 'Too many requests' },
      headers: { [RETRY_AFTER_HEADER]: '42' },
    });
    open();

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
      expect(request?.headers.get(CAPTCHA_BINDING_HEADER)).not.toBeNull();
    });
  });
});
