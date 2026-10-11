import { PASSWORD_COMPROMISED, PASSWORD_POLICY_RULES } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { passwordFieldErrors } from '../password-policy-messages';

describe('passwordFieldErrors', () => {
  it('translates rule codes', () => {
    expect(passwordFieldErrors([PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE], { locale: 'en' })).toEqual([
      'Password must not start or end with a space',
    ]);
  });

  it('translates the breached-password code', () => {
    expect(passwordFieldErrors([PASSWORD_COMPROMISED], { locale: 'en' })).toEqual([
      'This password has appeared in a data breach. Please choose a different one.',
    ]);
    expect(passwordFieldErrors([PASSWORD_COMPROMISED], { locale: 'de' })[0]).toContain('Datenleck');
    expect(passwordFieldErrors([PASSWORD_COMPROMISED], { locale: 'es' })[0]).toContain('filtración');
  });

  it('passes non-rule messages through unchanged', () => {
    expect(passwordFieldErrors(['Password is required'], { locale: 'en' })).toEqual(['Password is required']);
  });

  it('handles undefined', () => {
    expect(passwordFieldErrors(undefined)).toEqual([]);
  });
});
