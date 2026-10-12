import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../constants/auth-limits';

export const PASSWORD_POLICY_VIOLATION = 'PASSWORD_POLICY_VIOLATION' as const;

/** Error code Better Auth's haveIBeenPwned plugin returns (400) for a breached password. */
export const PASSWORD_COMPROMISED = 'PASSWORD_COMPROMISED' as const;

/** Error code (503) returned when the breached-password check could not run because HIBP is unreachable. */
export const PASSWORD_CHECK_UNAVAILABLE = 'PASSWORD_CHECK_UNAVAILABLE' as const;

/**
 * Length limits plus no leading or trailing space (OWASP / https://auth.pilcrowonpaper.com/passwords).
 * No composition rules; compromised passwords are screened server-side by Better Auth's haveIBeenPwned plugin.
 */
export const PASSWORD_POLICY_RULES = {
  MIN_LENGTH: 'MIN_LENGTH',
  MAX_LENGTH: 'MAX_LENGTH',
  LEADING_OR_TRAILING_SPACE: 'LEADING_OR_TRAILING_SPACE',
} as const;

export type PasswordPolicyRule = (typeof PASSWORD_POLICY_RULES)[keyof typeof PASSWORD_POLICY_RULES];

const RULE_CODES: ReadonlySet<unknown> = new Set(Object.values(PASSWORD_POLICY_RULES));

/** Narrows an unknown value (e.g. an error payload entry) to a known password rule code. */
export function isPasswordPolicyRule(value: unknown): value is PasswordPolicyRule {
  return RULE_CODES.has(value);
}

/** Returns the violated rule codes in a stable order; empty when the password is valid. The input is never modified. */
export function validatePasswordPolicy(password: string): PasswordPolicyRule[] {
  const violations: PasswordPolicyRule[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) violations.push(PASSWORD_POLICY_RULES.MIN_LENGTH);
  if (password.length > MAX_PASSWORD_LENGTH) violations.push(PASSWORD_POLICY_RULES.MAX_LENGTH);
  if (password.startsWith(' ') || password.endsWith(' ')) violations.push(PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE);
  return violations;
}
