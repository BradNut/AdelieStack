import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_POLICY_RULES, type PasswordPolicyRule } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { locales } from '$lib/paraglide/runtime.js';
import { passwordPolicyMessages } from '../password-policy-messages';

const ALL_RULES = Object.values(PASSWORD_POLICY_RULES);

describe('passwordPolicyMessages', () => {
  it.each(locales)('has a non-empty message for every rule in %s', (locale) => {
    for (const rule of ALL_RULES) {
      const [text] = passwordPolicyMessages([rule], { locale });
      expect(text).toBeTruthy();
      expect(text).not.toContain('{');
    }
  });

  it('interpolates the length limits', () => {
    const [min] = passwordPolicyMessages([PASSWORD_POLICY_RULES.MIN_LENGTH], { locale: 'en' });
    const [max] = passwordPolicyMessages([PASSWORD_POLICY_RULES.MAX_LENGTH], { locale: 'en' });
    expect(min).toContain(String(MIN_PASSWORD_LENGTH));
    expect(max).toContain(String(MAX_PASSWORD_LENGTH));
  });

  it('maps several codes in order', () => {
    const result = passwordPolicyMessages([PASSWORD_POLICY_RULES.DIGIT, PASSWORD_POLICY_RULES.UPPERCASE], { locale: 'en' });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatch(/digit/i);
    expect(result[1]).toMatch(/uppercase/i);
  });

  it('translates per locale', () => {
    const [en] = passwordPolicyMessages([PASSWORD_POLICY_RULES.DIGIT], { locale: 'en' });
    const [de] = passwordPolicyMessages([PASSWORD_POLICY_RULES.DIGIT], { locale: 'de' });
    expect(de).not.toBe(en);
  });

  it('returns an empty list for no codes', () => {
    expect(passwordPolicyMessages([])).toEqual([]);
  });

  it('skips unknown codes', () => {
    expect(passwordPolicyMessages(['NOPE' as PasswordPolicyRule])).toEqual([]);
  });
});
