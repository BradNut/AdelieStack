/** Captcha Providers with a token-based flow. The value is also the one Better Auth's captcha plugin expects. */
export const CaptchaProvider = {
  TURNSTILE: 'cloudflare-turnstile',
  RECAPTCHA: 'google-recaptcha',
  HCAPTCHA: 'hcaptcha',
  CAPTCHAFOX: 'captchafox',
} as const;
export type CaptchaProvider = (typeof CaptchaProvider)[keyof typeof CaptchaProvider];

export const CAPTCHA_PROVIDERS = Object.values(CaptchaProvider) as [CaptchaProvider, ...CaptchaProvider[]];

/** Request header carrying the Captcha Token. */
export const CAPTCHA_RESPONSE_HEADER = 'x-captcha-response';

/**
 * Anonymous auth endpoints that require a Captcha Token while captcha is on. Passkey, OAuth and
 * session-bound endpoints (including the two-factor OTP send) are deliberately absent.
 */
export const CAPTCHA_PROTECTED_PATHS = ['/sign-up/email', '/sign-in/email', '/request-password-reset', '/send-verification-email'] as const;

/** Error codes of Better Auth's captcha plugin: the token was missing (400) or rejected by the provider (403). */
export const CAPTCHA_MISSING_RESPONSE = 'MISSING_RESPONSE' as const;
export const CAPTCHA_VERIFICATION_FAILED = 'VERIFICATION_FAILED' as const;

/** Error code (503) returned when the Captcha Provider could not be reached to verify a token. */
export const CAPTCHA_UNAVAILABLE = 'CAPTCHA_UNAVAILABLE' as const;

/** Public captcha settings the web reads at runtime. Never carries the secret. */
export interface CaptchaPublicConfig {
  enabled: boolean;
  provider?: CaptchaProvider;
  siteKey?: string;
}
