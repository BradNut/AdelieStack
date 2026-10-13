import { CaptchaProvider } from '@adelie/shared';
import { createScriptWidget } from './script-widget';

/** hCaptcha. Its widget language follows the browser, so only the theme is passed. */
export const hcaptchaWidget = createScriptWidget({
  provider: CaptchaProvider.HCAPTCHA,
  scriptUrl: 'https://js.hcaptcha.com/1/api.js?render=explicit',
  global: 'hcaptcha',
  supportsLanguage: false,
});
