// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../load-script', () => ({ loadScript: vi.fn(async () => {}) }));

import { hcaptchaWidget } from '../hcaptcha';
import { turnstileWidget } from '../turnstile';
import type { CaptchaRenderOptions } from '../types';

const options: CaptchaRenderOptions = { siteKey: 'site', theme: 'dark', language: 'de', onToken: vi.fn(), onExpire: vi.fn(), onError: vi.fn() };

afterEach(() => {
  delete window.turnstile;
  delete window.hcaptcha;
});

describe.each([
  ['turnstile', turnstileWidget, 'turnstile'],
  ['hcaptcha', hcaptchaWidget, 'hcaptcha'],
] as const)('%s widget', (_name, widget, globalName) => {
  function stubApi() {
    const api = { render: vi.fn(() => 'widget-1'), reset: vi.fn(), remove: vi.fn() };
    window[globalName] = api;
    return api;
  }

  it('renders into the container with the site key, theme and callbacks', async () => {
    const api = stubApi();
    const container = document.createElement('div');

    await widget.render(container, options);

    expect(api.render).toHaveBeenCalledWith(container, expect.objectContaining({ sitekey: 'site', theme: 'dark', callback: options.onToken }));
  });

  it('resets and removes the rendered widget by id', async () => {
    const api = stubApi();

    const handle = await widget.render(document.createElement('div'), options);
    handle.reset();
    handle.destroy();

    expect(api.reset).toHaveBeenCalledWith('widget-1');
    expect(api.remove).toHaveBeenCalledWith('widget-1');
  });

  it('fails clearly when the provider script did not define its global', async () => {
    await expect(widget.render(document.createElement('div'), options)).rejects.toThrow(/missing/);
  });
});

describe('language', () => {
  it('is passed to Turnstile, which supports it', async () => {
    const api = { render: vi.fn(() => 'id'), reset: vi.fn(), remove: vi.fn() };
    window.turnstile = api;

    await turnstileWidget.render(document.createElement('div'), options);

    expect(api.render).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ language: 'de' }));
  });

  it('is not passed to hCaptcha, which follows the browser', async () => {
    const api = { render: vi.fn((_container: HTMLElement, _params: Record<string, unknown>) => 'id'), reset: vi.fn(), remove: vi.fn() };
    window.hcaptcha = api;

    await hcaptchaWidget.render(document.createElement('div'), options);

    expect(api.render.mock.calls[0]?.[1]).not.toHaveProperty('language');
  });
});
