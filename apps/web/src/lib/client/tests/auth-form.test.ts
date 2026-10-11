import { describe, expect, it, vi } from 'vitest';

vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

import { PASSWORD_POLICY_RULES, PASSWORD_POLICY_VIOLATION } from '@adelie/shared';
import { toast } from 'svelte-sonner';
import { authErrorMessage, GENERIC_AUTH_ERROR, passwordPolicyViolationRules, toastIfError } from '../auth-form';

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

describe('passwordPolicyViolationRules', () => {
  it('returns the known rules of a policy violation', () => {
    const error = { code: PASSWORD_POLICY_VIOLATION, rules: [PASSWORD_POLICY_RULES.DIGIT, 'bogus', PASSWORD_POLICY_RULES.SPECIAL] };
    expect(passwordPolicyViolationRules(error)).toEqual([PASSWORD_POLICY_RULES.DIGIT, PASSWORD_POLICY_RULES.SPECIAL]);
  });

  it('also reads the code from the message', () => {
    expect(passwordPolicyViolationRules({ message: PASSWORD_POLICY_VIOLATION, rules: [PASSWORD_POLICY_RULES.UPPERCASE] })).toEqual([
      PASSWORD_POLICY_RULES.UPPERCASE,
    ]);
  });

  it.each([
    null,
    undefined,
    {},
    { code: 'INVALID_PASSWORD', message: 'Invalid password' },
    { code: PASSWORD_POLICY_VIOLATION },
    { code: PASSWORD_POLICY_VIOLATION, rules: [] },
    { code: PASSWORD_POLICY_VIOLATION, rules: ['bogus'] },
    { code: 'OTHER', rules: [PASSWORD_POLICY_RULES.DIGIT] },
  ])('returns null for %j', (error) => {
    expect(passwordPolicyViolationRules(error)).toBeNull();
  });
});
