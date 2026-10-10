import { describe, expect, it, vi } from 'vitest';

vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

import { toast } from 'svelte-sonner';
import { authErrorMessage, GENERIC_AUTH_ERROR, toastIfError } from '../auth-form';

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
