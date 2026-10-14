import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_POLICY_RULES } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { locales } from '#lib/paraglide/runtime.js';
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
    const result = passwordPolicyMessages([PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE, PASSWORD_POLICY_RULES.MIN_LENGTH], { locale: 'en' });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatch(/space/i);
    expect(result[1]).toMatch(/at least/i);
  });

  it('translates per locale', () => {
    const [en] = passwordPolicyMessages([PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE], { locale: 'en' });
    const [de] = passwordPolicyMessages([PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE], { locale: 'de' });
    const [es] = passwordPolicyMessages([PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE], { locale: 'es' });
    expect(new Set([en, de, es]).size).toBe(3);
  });

  it('returns an empty list for no codes', () => {
    expect(passwordPolicyMessages([])).toEqual([]);
  });
});
