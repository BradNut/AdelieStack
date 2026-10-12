import { CAPTCHA_RESPONSE_HEADER } from '@adelie/shared';

/** Better Auth client fetch options carrying the Captcha Token; empty when there is none (captcha off). */
export function captchaFetchOptions(token: string): { headers?: Record<string, string> } {
  return token ? { headers: { [CAPTCHA_RESPONSE_HEADER]: token } } : {};
}
