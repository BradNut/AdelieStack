import type CaptchaField from '#lib/components/auth/captcha-field.svelte';
import { captchaFetchOptions } from './request';

/**
 * Per-form captcha state: the current Captcha Token and the widget to reset. A protected form creates one,
 * renders `<CaptchaField bind:this={captcha.field} onchange={captcha.setToken} />`, passes `captcha.fetchOptions()`
 * with its Better Auth call, and calls `captcha.afterAttempt()` once the call returns.
 */
export function createCaptchaForm() {
  let token = $state('');
  let field = $state<ReturnType<typeof CaptchaField>>();
  return {
    get field() {
      return field;
    },
    set field(value) {
      field = value;
    },
    setToken(value: string) {
      token = value;
    },
    fetchOptions: () => captchaFetchOptions(token),
    /** Tokens are single-use: call after every attempt, successful or not. */
    afterAttempt: () => field?.reset(),
  };
}
