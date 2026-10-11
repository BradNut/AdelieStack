import { describe, expect, it } from 'vitest';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../constants';
import { PASSWORD_POLICY_RULES, PASSWORD_POLICY_VIOLATION, validatePasswordPolicy } from './password-policy';

const VALID = 'Passw0rd!';
const padded = (length: number) => `Aa1!${'a'.repeat(length - 4)}`;

describe('validatePasswordPolicy', () => {
  it('exposes the stable error code', () => {
    expect(PASSWORD_POLICY_VIOLATION).toBe('PASSWORD_POLICY_VIOLATION');
  });

  it('returns no codes for a valid password', () => {
    expect(validatePasswordPolicy(VALID)).toEqual([]);
  });

  it.each([
    ['too short', 'Pa5!', PASSWORD_POLICY_RULES.MIN_LENGTH],
    ['too long', padded(MAX_PASSWORD_LENGTH + 10), PASSWORD_POLICY_RULES.MAX_LENGTH],
    ['no uppercase', 'passw0rd!', PASSWORD_POLICY_RULES.UPPERCASE],
    ['no digit', 'Password!', PASSWORD_POLICY_RULES.DIGIT],
    ['no special', 'Passw0rdd', PASSWORD_POLICY_RULES.SPECIAL],
  ])('returns exactly one code when %s', (_name, password, code) => {
    expect(validatePasswordPolicy(password)).toEqual([code]);
  });

  it('returns all violated codes together', () => {
    expect(validatePasswordPolicy('abc')).toEqual([
      PASSWORD_POLICY_RULES.MIN_LENGTH,
      PASSWORD_POLICY_RULES.UPPERCASE,
      PASSWORD_POLICY_RULES.DIGIT,
      PASSWORD_POLICY_RULES.SPECIAL,
    ]);
  });

  it('handles boundary lengths', () => {
    expect(validatePasswordPolicy(padded(MIN_PASSWORD_LENGTH - 1))).toEqual([PASSWORD_POLICY_RULES.MIN_LENGTH]);
    expect(validatePasswordPolicy(padded(MIN_PASSWORD_LENGTH))).toEqual([]);
    expect(validatePasswordPolicy(padded(MAX_PASSWORD_LENGTH))).toEqual([]);
    expect(validatePasswordPolicy(padded(MAX_PASSWORD_LENGTH + 1))).toEqual([PASSWORD_POLICY_RULES.MAX_LENGTH]);
  });

  it('accepts unusual special characters', () => {
    for (const ch of ['!', '@', '#', '~', '`', '"', "'", '\\', '/', '_', '-', '€', '¿']) {
      expect(validatePasswordPolicy(`Passw0rd${ch}`)).toEqual([]);
    }
  });

  it('does not treat whitespace as a special character', () => {
    expect(validatePasswordPolicy('Passw0rd ')).toEqual([PASSWORD_POLICY_RULES.SPECIAL]);
  });

  it('accepts non-ASCII uppercase but not non-ASCII letters as specials', () => {
    expect(validatePasswordPolicy('Élodie123!')).toEqual([]);
    expect(validatePasswordPolicy('élodie123é')).toEqual([PASSWORD_POLICY_RULES.UPPERCASE, PASSWORD_POLICY_RULES.SPECIAL]);
  });

  it('only counts ASCII digits', () => {
    expect(validatePasswordPolicy('Passwörd!٣')).toEqual([PASSWORD_POLICY_RULES.DIGIT]);
  });
});
