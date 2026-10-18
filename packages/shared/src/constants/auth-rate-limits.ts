/** A rate-limit rule: at most `max` requests per client and path in a window of `window` seconds. */
export interface AuthRateLimitRule {
  window: number;
  max: number;
}

/** Applies to every auth endpoint without a rule of its own. */
export const AUTH_RATE_LIMIT_DEFAULT: AuthRateLimitRule = { window: 60, max: 100 };

/** For endpoints that check a credential or a code, where every request is a guess. */
export const AUTH_RATE_LIMIT_STRICT: AuthRateLimitRule = { window: 60, max: 5 };

/**
 * Stricter rules for the endpoints an attacker would hammer to guess credentials or codes. Keys are
 * Better Auth paths below the auth base path; `*` matches the rest of the path. The first matching key
 * wins, so exact entries come before the wildcards. Better Auth and its two-factor plugin ship their
 * own tight limits for `/sign-in*` and `/two-factor/*` (3 per 10 seconds) that only a matching rule
 * overrides, so those wildcards are pinned to the default; the exact entries above them are the only
 * strict ones. A new credential or code-guessing endpoint needs an exact entry here.
 */
export const AUTH_RATE_LIMIT_RULES = {
  '/sign-in/email': AUTH_RATE_LIMIT_STRICT,
  '/two-factor/verify-totp': AUTH_RATE_LIMIT_STRICT,
  '/two-factor/verify-otp': AUTH_RATE_LIMIT_STRICT,
  '/two-factor/verify-backup-code': AUTH_RATE_LIMIT_STRICT,
  '/sign-in/*': AUTH_RATE_LIMIT_DEFAULT,
  '/two-factor/*': AUTH_RATE_LIMIT_DEFAULT,
  '/request-password-reset': { window: 300, max: 3 },
  '/reset-password': { window: 300, max: 5 },
  '/passkey/*': { window: 60, max: 10 },
} as const satisfies Record<string, AuthRateLimitRule>;

/** Response header Better Auth sets on a throttled (429) request: seconds until the client may retry. */
export const RETRY_AFTER_HEADER = 'x-retry-after';
