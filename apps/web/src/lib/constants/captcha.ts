/**
 * Internal header that marks a Better Auth request as bound to a Captcha Token by `createCaptchaForm().attempt`.
 * Web-only: the captcha binding guard in the web auth client checks it on captcha-protected paths and strips it
 * before the request is sent, so it never reaches the API. It marks the binding, not the token: it is sent with
 * captcha on or off.
 */
export const CAPTCHA_BINDING_HEADER = 'x-adelie-captcha-bound';

/** Value of {@link CAPTCHA_BINDING_HEADER}; only its presence matters. */
export const CAPTCHA_BINDING_VALUE = '1';
