/** A rate-limit rule: at most `max` requests per client and path in a window of `window` seconds. */
export interface AuthRateLimitRule {
  window: number;
  max: number;
}

/** Applies to every auth endpoint without a rule of its own. */
export const AUTH_RATE_LIMIT_DEFAULT: AuthRateLimitRule = { window: 60, max: 100 };

/**
 * Stricter rules for the endpoints an attacker would hammer to guess credentials or codes. Keys are
 * Better Auth paths below the auth base path; `*` matches the rest of the path.
 */
export const AUTH_RATE_LIMIT_RULES = {
  '/sign-in/*': { window: 60, max: 5 },
  '/two-factor/*': { window: 60, max: 5 },
  '/request-password-reset': { window: 300, max: 3 },
  '/reset-password': { window: 300, max: 5 },
  '/passkey/*': { window: 60, max: 10 },
} as const satisfies Record<string, AuthRateLimitRule>;

/** Response header Better Auth sets on a throttled (429) request: seconds until the client may retry. */
export const RETRY_AFTER_HEADER = 'X-Retry-After';
