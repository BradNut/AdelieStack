import { CaptchaProvider } from '@adelie/shared';
import { createScriptWidget } from './script-widget';

/** Cloudflare Turnstile, loaded directly from Cloudflare (no wrapper package). */
export const turnstileWidget = createScriptWidget({
  provider: CaptchaProvider.TURNSTILE,
  scriptUrl: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
  global: 'turnstile',
  supportsLanguage: true,
});
