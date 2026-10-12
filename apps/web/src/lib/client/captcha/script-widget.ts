import type { CaptchaProvider } from '@adelie/shared';
import { loadScript } from './load-script';
import type { CaptchaWidget } from './types';

/** The part of a provider's browser API that Turnstile and hCaptcha share. */
interface ProviderApi {
  render(container: HTMLElement, params: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

interface ScriptWidgetOptions {
  provider: CaptchaProvider;
  scriptUrl: string;
  /** The `window` property the provider's script defines. */
  global: 'turnstile' | 'hcaptcha';
  /** Whether the provider lets the widget follow the site's language. */
  supportsLanguage: boolean;
}

declare global {
  interface Window {
    turnstile?: ProviderApi;
    hcaptcha?: ProviderApi;
  }
}

/** A {@link CaptchaWidget} for a provider that ships a script exposing render/reset/remove. */
export function createScriptWidget({ provider, scriptUrl, global, supportsLanguage }: ScriptWidgetOptions): CaptchaWidget {
  return {
    provider,
    async render(container, { siteKey, theme, language, onToken, onExpire, onError }) {
      await loadScript(scriptUrl);
      const api = window[global];
      if (!api) throw new Error(`${provider} script loaded but window.${global} is missing`);
      const id = api.render(container, {
        sitekey: siteKey,
        theme,
        ...(supportsLanguage && { language }),
        callback: onToken,
        'expired-callback': onExpire,
        'error-callback': onError,
      });
      return {
        reset: () => api.reset(id),
        destroy: () => api.remove(id),
      };
    },
  };
}
