// @vitest-environment jsdom

import type { CaptchaPublicConfig } from '@adelie/shared';
import { CaptchaProvider } from '@adelie/shared';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getCaptchaConfig = vi.fn<() => Promise<CaptchaPublicConfig>>();
const handle = { reset: vi.fn(), destroy: vi.fn() };
const render_ = vi.fn();

vi.mock('#lib/client/captcha/config.ts', () => ({ getCaptchaConfig: () => getCaptchaConfig() }));
vi.mock('#lib/client/captcha/widgets.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#lib/client/captcha/widgets.ts')>();
  return {
    ...actual,
    captchaWidgetFor: (provider: string | undefined) => {
      if (provider === CaptchaProvider.RECAPTCHA) throw new actual.CaptchaConfigError('no widget for google-recaptcha');
      return { provider, render: render_ };
    },
  };
});
vi.mock('mode-watcher', () => ({ mode: { current: 'light' } }));

import CaptchaField from '../captcha-field.svelte';

beforeEach(() => {
  render_.mockReset().mockResolvedValue(handle);
  handle.reset.mockReset();
  handle.destroy.mockReset();
  getCaptchaConfig.mockReset();
});

afterEach(cleanup);

describe('CaptchaField', () => {
  it('renders the widget when the API reports captcha enabled', async () => {
    getCaptchaConfig.mockResolvedValue({ enabled: true, provider: CaptchaProvider.TURNSTILE, siteKey: 'site' });

    render(CaptchaField);

    expect(await screen.findByTestId('captcha-widget')).toBeTruthy();
    await waitFor(() => expect(render_).toHaveBeenCalledOnce());
    expect(render_.mock.calls[0]?.[1]).toMatchObject({ siteKey: 'site' });
  });

  it('renders nothing when captcha is disabled', async () => {
    getCaptchaConfig.mockResolvedValue({ enabled: false });

    render(CaptchaField);

    await waitFor(() => expect(getCaptchaConfig).toHaveBeenCalled());
    expect(screen.queryByTestId('captcha-widget')).toBeNull();
    expect(render_).not.toHaveBeenCalled();
  });

  it('shows a configuration error, not a silent nothing, for a provider without a widget', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    getCaptchaConfig.mockResolvedValue({ enabled: true, provider: CaptchaProvider.RECAPTCHA, siteKey: 'site' });

    render(CaptchaField);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('google-recaptcha'));
    error.mockRestore();
  });

  it('passes the token up and clears it when the widget expires', async () => {
    getCaptchaConfig.mockResolvedValue({ enabled: true, provider: CaptchaProvider.TURNSTILE, siteKey: 'site' });
    const onchange = vi.fn();

    render(CaptchaField, { onchange });
    await waitFor(() => expect(render_).toHaveBeenCalled());
    const options = render_.mock.calls[0]?.[1];
    options.onToken('abc');
    options.onExpire();

    expect(onchange.mock.calls.map(([t]) => t)).toEqual(['abc', '']);
  });
});
