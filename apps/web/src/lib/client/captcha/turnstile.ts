import { CaptchaProvider } from '@adelie/shared';
import { loadScript } from './load-script';
import type { CaptchaWidget } from './types';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(container: HTMLElement, params: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Cloudflare Turnstile, loaded directly from Cloudflare (no wrapper package). */
export const turnstileWidget: CaptchaWidget = {
  provider: CaptchaProvider.TURNSTILE,
  async render(container, { siteKey, theme, language, onToken, onExpire, onError }) {
    await loadScript(SCRIPT_URL);
    const api = window.turnstile;
    if (!api) throw new Error('Turnstile script loaded but window.turnstile is missing');
    const id = api.render(container, {
      sitekey: siteKey,
      theme,
      language,
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
