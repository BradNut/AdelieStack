import { describe, expect, it } from 'vitest';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../constants';
import { isPasswordPolicyRule, PASSWORD_POLICY_RULES, PASSWORD_POLICY_VIOLATION, validatePasswordPolicy } from './password-policy';

const VALID = 'correct horse battery';
const padded = (length: number) => 'a'.repeat(length);

describe('validatePasswordPolicy', () => {
  it('exposes the stable error code', () => {
    expect(PASSWORD_POLICY_VIOLATION).toBe('PASSWORD_POLICY_VIOLATION');
  });

  it('returns no codes for a valid password', () => {
    expect(validatePasswordPolicy(VALID)).toEqual([]);
  });

  it('has no composition rules', () => {
    expect(Object.values(PASSWORD_POLICY_RULES).sort()).toEqual(['LEADING_OR_TRAILING_SPACE', 'MAX_LENGTH', 'MIN_LENGTH']);
  });

  it.each([
    ['too short', 'short', PASSWORD_POLICY_RULES.MIN_LENGTH],
    ['too long', padded(MAX_PASSWORD_LENGTH + 10), PASSWORD_POLICY_RULES.MAX_LENGTH],
    ['leading space', ' leadingspace', PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE],
    ['trailing space', 'trailingspace ', PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE],
  ])('returns exactly one code when %s', (_name, password, code) => {
    expect(validatePasswordPolicy(password)).toEqual([code]);
  });

  it('returns all violated codes together', () => {
    expect(validatePasswordPolicy(' ab')).toEqual([PASSWORD_POLICY_RULES.MIN_LENGTH, PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE]);
  });

  it('handles boundary lengths', () => {
    expect(validatePasswordPolicy(padded(MIN_PASSWORD_LENGTH - 1))).toEqual([PASSWORD_POLICY_RULES.MIN_LENGTH]);
    expect(validatePasswordPolicy(padded(MIN_PASSWORD_LENGTH))).toEqual([]);
    expect(validatePasswordPolicy(padded(MAX_PASSWORD_LENGTH))).toEqual([]);
    expect(validatePasswordPolicy(padded(MAX_PASSWORD_LENGTH + 1))).toEqual([PASSWORD_POLICY_RULES.MAX_LENGTH]);
  });

  it('accepts any characters: all lowercase, no digits, unicode, emoji and internal spaces', () => {
    for (const password of ['alllowercase', '12345678', 'pässwörd-é€¿', 'пароль-пароль', '密码密码密码密码', 'pass 🐧 phrase', 'a b c d e f']) {
      expect(validatePasswordPolicy(password)).toEqual([]);
    }
  });

  it('only treats the plain space as leading or trailing whitespace', () => {
    expect(validatePasswordPolicy('\tpassphrase')).toEqual([]);
  });

  it('rejects a password made only of spaces', () => {
    expect(validatePasswordPolicy('        ')).toEqual([PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE]);
  });
});

describe('isPasswordPolicyRule', () => {
  it('accepts every known rule', () => {
    for (const rule of Object.values(PASSWORD_POLICY_RULES)) expect(isPasswordPolicyRule(rule)).toBe(true);
  });

  it.each(['NOPE', 'UPPERCASE', '', 1, null, undefined, {}])('rejects %s', (value) => {
    expect(isPasswordPolicyRule(value)).toBe(false);
  });
});
