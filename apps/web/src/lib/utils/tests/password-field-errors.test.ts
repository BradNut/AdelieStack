import { PASSWORD_POLICY_RULES } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { passwordFieldErrors } from '../password-policy-messages';

describe('passwordFieldErrors', () => {
  it('translates rule codes', () => {
    expect(passwordFieldErrors([PASSWORD_POLICY_RULES.DIGIT], { locale: 'en' })).toEqual(['Password must contain a digit']);
  });

  it('passes non-rule messages through unchanged', () => {
    expect(passwordFieldErrors(['Password is required'], { locale: 'en' })).toEqual(['Password is required']);
  });

  it('handles undefined', () => {
    expect(passwordFieldErrors(undefined)).toEqual([]);
  });
});
