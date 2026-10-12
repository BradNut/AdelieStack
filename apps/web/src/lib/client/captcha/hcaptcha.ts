import { CaptchaProvider } from '@adelie/shared';
import { loadScript } from './load-script';
import type { CaptchaWidget } from './types';

const SCRIPT_URL = 'https://js.hcaptcha.com/1/api.js?render=explicit';

interface HcaptchaApi {
  render(container: HTMLElement, params: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    hcaptcha?: HcaptchaApi;
  }
}

/** hCaptcha. Its widget language follows the browser; only the theme is passed. */
export const hcaptchaWidget: CaptchaWidget = {
  provider: CaptchaProvider.HCAPTCHA,
  async render(container, { siteKey, theme, onToken, onExpire, onError }) {
    await loadScript(SCRIPT_URL);
    const api = window.hcaptcha;
    if (!api) throw new Error('hCaptcha script loaded but window.hcaptcha is missing');
    const id = api.render(container, {
      sitekey: siteKey,
      theme,
      callback: onToken,
      'expired-callback': onExpire,
      'error-callback': onError,
    });
    return {
      reset() {
        api.reset(id);
      },
      destroy() {
        api.remove(id);
      },
    };
  },
};
