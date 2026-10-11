import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../constants/auth-limits';

export const PASSWORD_POLICY_VIOLATION = 'PASSWORD_POLICY_VIOLATION' as const;

export const PASSWORD_POLICY_RULES = {
  MIN_LENGTH: 'MIN_LENGTH',
  MAX_LENGTH: 'MAX_LENGTH',
  UPPERCASE: 'UPPERCASE',
  DIGIT: 'DIGIT',
  SPECIAL: 'SPECIAL',
} as const;

export type PasswordPolicyRule = (typeof PASSWORD_POLICY_RULES)[keyof typeof PASSWORD_POLICY_RULES];

const UPPERCASE_PATTERN = /\p{Lu}/u;
const DIGIT_PATTERN = /[0-9]/;
// Anything that is not a letter, number or whitespace.
const SPECIAL_PATTERN = /[^\p{L}\p{N}\s]/u;

/** Returns the violated rule codes in a stable order; empty when the password is valid. */
export function validatePasswordPolicy(password: string): PasswordPolicyRule[] {
  const violations: PasswordPolicyRule[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) violations.push(PASSWORD_POLICY_RULES.MIN_LENGTH);
  if (password.length > MAX_PASSWORD_LENGTH) violations.push(PASSWORD_POLICY_RULES.MAX_LENGTH);
  if (!UPPERCASE_PATTERN.test(password)) violations.push(PASSWORD_POLICY_RULES.UPPERCASE);
  if (!DIGIT_PATTERN.test(password)) violations.push(PASSWORD_POLICY_RULES.DIGIT);
  if (!SPECIAL_PATTERN.test(password)) violations.push(PASSWORD_POLICY_RULES.SPECIAL);
  return violations;
}
