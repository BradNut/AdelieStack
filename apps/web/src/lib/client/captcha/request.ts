import { CAPTCHA_RESPONSE_HEADER } from '@adelie/shared';
import { CAPTCHA_BINDING_HEADER, CAPTCHA_BINDING_VALUE } from '#lib/constants/captcha.ts';

/** Better Auth client fetch options for one captcha-bound attempt. */
export interface CaptchaFetchOptions {
  headers: Record<string, string>;
}

/** Always carries the binding marker; carries the Captcha Token header only when there is a token (captcha off: none). */
export function captchaFetchOptions(token: string): CaptchaFetchOptions {
  const headers: Record<string, string> = { [CAPTCHA_BINDING_HEADER]: CAPTCHA_BINDING_VALUE };
  if (token) headers[CAPTCHA_RESPONSE_HEADER] = token;
  return { headers };
}
