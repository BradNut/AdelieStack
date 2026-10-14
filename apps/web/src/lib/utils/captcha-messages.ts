import { CAPTCHA_MISSING_RESPONSE, CAPTCHA_UNAVAILABLE, CAPTCHA_VERIFICATION_FAILED } from '@adelie/shared';
import * as m from '#lib/paraglide/messages.js';
import type { Locale } from '#lib/paraglide/runtime.js';

type MessageOptions = { locale?: Locale };

/**
 * The translated message for a Better Auth error caused by captcha: a missing or refused Captcha Token asks for
 * a retry, an unreachable Captcha Provider says it is temporarily unavailable. Null for any other error.
 */
export function captchaErrorMessage(error: { code?: string } | null | undefined, options: MessageOptions = {}): string | null {
  switch (error?.code) {
    case CAPTCHA_MISSING_RESPONSE:
    case CAPTCHA_VERIFICATION_FAILED:
      return m.validation_captcha_invalid({}, options);
    case CAPTCHA_UNAVAILABLE:
      return m.validation_captcha_unavailable({}, options);
    default:
      return null;
  }
}
