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
 * For endpoints that send an email, so repeated requests cannot flood an inbox. The 5-minute window
 * matches how long an emailed two-factor code stays valid.
 */
export const AUTH_RATE_LIMIT_EMAIL: AuthRateLimitRule = { window: 300, max: 3 };

/**
 * Per-path rules: strict exact entries for the endpoints that check a credential or a code, email
 * entries for the endpoints that send an email (two-factor code, password reset), two wildcards pinned
 * to the default, and own limits for resetting a password and passkey. Keys are Better Auth paths
 * below the auth base path; `*` matches the rest. The first matching key wins, so exact entries
 * come before the wildcards. The pins exist because Better Auth's built-in limit for `/sign-in*` and
 * `/two-factor/*` (3 per 10 seconds) applies unless a rule matches.
 */
export const AUTH_RATE_LIMIT_RULES = {
  '/sign-in/email': AUTH_RATE_LIMIT_STRICT,
  '/two-factor/verify-totp': AUTH_RATE_LIMIT_STRICT,
  '/two-factor/verify-otp': AUTH_RATE_LIMIT_STRICT,
  '/two-factor/verify-backup-code': AUTH_RATE_LIMIT_STRICT,
  '/two-factor/disable': AUTH_RATE_LIMIT_STRICT,
  '/two-factor/get-totp-uri': AUTH_RATE_LIMIT_STRICT,
  '/two-factor/generate-backup-codes': AUTH_RATE_LIMIT_STRICT,
  '/two-factor/send-otp': AUTH_RATE_LIMIT_EMAIL,
  '/sign-in/*': AUTH_RATE_LIMIT_DEFAULT,
  '/two-factor/*': AUTH_RATE_LIMIT_DEFAULT,
  '/request-password-reset': AUTH_RATE_LIMIT_EMAIL,
  '/reset-password': { window: 300, max: 5 },
  '/passkey/*': { window: 60, max: 10 },
} as const satisfies Record<string, AuthRateLimitRule>;

/**
 * Endpoints below the pinned `/sign-in/*` and `/two-factor/*` wildcards that stay on the default on
 * purpose: none of them checks a credential or a code, or sends an email. Each must be a real Better
 * Auth path without an exact rule of its own; a test fails otherwise, and when a new endpoint is
 * neither listed nor ruled.
 */
export const AUTH_RATE_LIMIT_DEFAULT_PATHS = ['/sign-in/social', '/two-factor/enable'] as const;

/** Response header Better Auth sets on a throttled (429) request: seconds until the client may retry. */
export const RETRY_AFTER_HEADER = 'x-retry-after';
