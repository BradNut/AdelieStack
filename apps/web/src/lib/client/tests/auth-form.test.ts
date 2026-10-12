import { describe, expect, it, vi } from 'vitest';

vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

import { PASSWORD_CHECK_UNAVAILABLE, PASSWORD_COMPROMISED, PASSWORD_POLICY_RULES, PASSWORD_POLICY_VIOLATION } from '@adelie/shared';
import { toast } from 'svelte-sonner';
import { authErrorMessage, GENERIC_AUTH_ERROR, passwordRejectionCodes, toastIfError } from '../auth-form';

describe('authErrorMessage', () => {
  it('uses the message Better Auth returned', () => {
    expect(authErrorMessage({ message: 'Invalid email or password' })).toBe('Invalid email or password');
  });

  it.each([null, undefined, {}, { message: '' }])('falls back for %j', (error) => {
    expect(authErrorMessage(error)).toBe(GENERIC_AUTH_ERROR);
  });

  it('uses a custom fallback', () => {
    expect(authErrorMessage(null, 'Nope')).toBe('Nope');
  });
});

describe('toastIfError', () => {
  it('toasts and returns true on an error', () => {
    expect(toastIfError({ message: 'Bad code' })).toBe(true);
    expect(toast.error).toHaveBeenCalledWith('Bad code');
  });

  it('does nothing and returns false without an error', () => {
    vi.mocked(toast.error).mockClear();
    expect(toastIfError(null)).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('passwordRejectionCodes', () => {
  it('returns the known rules of a policy violation', () => {
    const error = {
      code: PASSWORD_POLICY_VIOLATION,
      rules: [PASSWORD_POLICY_RULES.MIN_LENGTH, 'bogus', PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE],
    };
    expect(passwordRejectionCodes(error)).toEqual([PASSWORD_POLICY_RULES.MIN_LENGTH, PASSWORD_POLICY_RULES.LEADING_OR_TRAILING_SPACE]);
  });

  it('also reads the code from the message', () => {
    expect(passwordRejectionCodes({ message: PASSWORD_POLICY_VIOLATION, rules: [PASSWORD_POLICY_RULES.MAX_LENGTH] })).toEqual([
      PASSWORD_POLICY_RULES.MAX_LENGTH,
    ]);
  });

  it('maps the breached-password error to its own code', () => {
    expect(passwordRejectionCodes({ code: PASSWORD_COMPROMISED, message: 'The password you entered has been compromised.' })).toEqual([
      PASSWORD_COMPROMISED,
    ]);
  });

  it('maps an HIBP outage to its own code', () => {
    expect(passwordRejectionCodes({ code: PASSWORD_CHECK_UNAVAILABLE, message: 'Failed to check password.' })).toEqual([PASSWORD_CHECK_UNAVAILABLE]);
  });

  it.each([
    null,
    undefined,
    {},
    { code: 'INVALID_PASSWORD', message: 'Invalid password' },
    { code: PASSWORD_POLICY_VIOLATION },
    { code: PASSWORD_POLICY_VIOLATION, rules: [] },
    { code: PASSWORD_POLICY_VIOLATION, rules: ['bogus'] },
    { code: 'OTHER', rules: [PASSWORD_POLICY_RULES.MIN_LENGTH] },
  ])('returns null for %j', (error) => {
    expect(passwordRejectionCodes(error)).toBeNull();
  });
});
