import { CaptchaProvider } from '@adelie/shared';
import { hcaptchaWidget } from './hcaptcha';
import { turnstileWidget } from './turnstile';
import type { CaptchaWidget } from './types';

export class CaptchaConfigError extends Error {
  override name = 'CaptchaConfigError';
}

/**
 * Widgets shipped with the template. To support another provider, implement {@link CaptchaWidget} and add it here
 * (its script and frame origins also go into `csp-directives.mjs`).
 */
const WIDGETS: Partial<Record<CaptchaProvider, CaptchaWidget>> = {
  [CaptchaProvider.TURNSTILE]: turnstileWidget,
  [CaptchaProvider.HCAPTCHA]: hcaptchaWidget,
};

/** The widget for the provider the API reports; throws a clear error rather than rendering nothing when there is none. */
export function captchaWidgetFor(provider: CaptchaProvider | undefined): CaptchaWidget {
  if (!provider) throw new CaptchaConfigError('Captcha is enabled but the API reported no CAPTCHA_PROVIDER.');
  const widget = WIDGETS[provider];
  if (!widget) {
    throw new CaptchaConfigError(
      `No captcha widget ships for CAPTCHA_PROVIDER=${provider}. Implement CaptchaWidget in $lib/client/captcha and register it in widgets.ts.`,
    );
  }
  return widget;
}
