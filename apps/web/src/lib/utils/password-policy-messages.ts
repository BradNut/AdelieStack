import {
  isPasswordPolicyRule,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_CHECK_UNAVAILABLE,
  PASSWORD_COMPROMISED,
  PASSWORD_POLICY_RULES,
  type PasswordPolicyRule,
} from '@adelie/shared';
import * as m from '#lib/paraglide/messages.js';
import type { Locale } from '#lib/paraglide/runtime.js';

type MessageOptions = { locale?: Locale };

const RULE_MESSAGES: Record<PasswordPolicyRule, (options: MessageOptions) => string> = {
  [PASSWORD_POLICY_RULES.MIN_LENGTH]: (o) => m.validation_password_rule_min_length({ min: MIN_PASSWORD_LENGTH }, o),
  [PASSWORD_POLICY_RULES.MAX_LENGTH]: (o) => m.validation_password_rule_max_length({ max: MAX_PASSWORD_LENGTH }, o),
  [PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE]: (o) => m.validation_password_rule_leading_or_trailing_space({}, o),
};

/** Maps password rule codes to translated messages (one per code, in input order). Callers choose how to present them. */
export function passwordPolicyMessages(rules: readonly PasswordPolicyRule[], options: MessageOptions = {}): string[] {
  return rules.map((rule) => RULE_MESSAGES[rule](options));
}

/** Translates rule-code, breached-password and check-unavailable form errors; any other error text passes through unchanged. */
export function passwordFieldErrors(errors: readonly string[] | undefined, options: MessageOptions = {}): string[] {
  return (errors ?? []).map((error) => {
    if (isPasswordPolicyRule(error)) return RULE_MESSAGES[error](options);
    if (error === PASSWORD_COMPROMISED) return m.validation_password_compromised({}, options);
    if (error === PASSWORD_CHECK_UNAVAILABLE) return m.validation_password_check_unavailable({}, options);
    return error;
  });
}
