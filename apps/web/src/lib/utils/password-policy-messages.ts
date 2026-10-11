import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_POLICY_RULES, type PasswordPolicyRule } from '@adelie/shared';
import * as m from '$lib/paraglide/messages.js';
import type { Locale } from '$lib/paraglide/runtime.js';

type MessageOptions = { locale?: Locale };

const RULE_MESSAGES: Record<PasswordPolicyRule, (options: MessageOptions) => string> = {
  [PASSWORD_POLICY_RULES.MIN_LENGTH]: (o) => m.validation_password_rule_min_length({ min: MIN_PASSWORD_LENGTH }, o),
  [PASSWORD_POLICY_RULES.MAX_LENGTH]: (o) => m.validation_password_rule_max_length({ max: MAX_PASSWORD_LENGTH }, o),
  [PASSWORD_POLICY_RULES.UPPERCASE]: (o) => m.validation_password_rule_uppercase({}, o),
  [PASSWORD_POLICY_RULES.DIGIT]: (o) => m.validation_password_rule_digit({}, o),
  [PASSWORD_POLICY_RULES.SPECIAL]: (o) => m.validation_password_rule_special({}, o),
};

/** Maps password rule codes to translated messages (one per known code, in input order). Callers choose how to present them. */
export function passwordPolicyMessages(rules: readonly PasswordPolicyRule[], options: MessageOptions = {}): string[] {
  return rules.flatMap((rule) => {
    const message = RULE_MESSAGES[rule];
    return message ? [message(options)] : [];
  });
}
