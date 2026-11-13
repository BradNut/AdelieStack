import type CaptchaField from '#lib/components/auth/captcha-field.svelte';
import { type CaptchaFetchOptions, captchaFetchOptions } from './request';

/** The part of a mounted `CaptchaField` the form state needs. */
type CaptchaFieldHandle = Pick<ReturnType<typeof CaptchaField>, 'reset'>;

/**
 * Per-form captcha state: the current Captcha Token and the widget to reset. A protected form creates one (each form
 * owns its own instance, so several mounted widgets never share a token), renders
 * `<CaptchaField bind:this={captcha.field} onchange={captcha.setToken} />`, and makes its Better Auth call through
 * `captcha.attempt((fetchOptions) => authClient.x(body, fetchOptions))`.
 */
export function createCaptchaForm() {
  let token = $state('');
  let field = $state<CaptchaFieldHandle>();
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
    /**
     * Runs one protected attempt: hands `fn` the fetch options binding this attempt's Captcha Token and returns its
     * result. Tokens are single-use, so the widget is reset once `fn` settles, whether it succeeded, returned an
     * error or threw.
     */
    async attempt<T>(fn: (fetchOptions: CaptchaFetchOptions) => Promise<T>): Promise<T> {
      try {
        return await fn(captchaFetchOptions(token));
      } finally {
        field?.reset();
      }
    },
  };
}
