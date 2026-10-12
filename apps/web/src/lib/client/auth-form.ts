import {
  isPasswordPolicyRule,
  PASSWORD_CHECK_UNAVAILABLE,
  PASSWORD_COMPROMISED,
  PASSWORD_POLICY_VIOLATION,
  type PasswordPolicyRule,
} from '@adelie/shared';
import { toast } from 'svelte-sonner';
import { invalidateAll } from '$app/navigation';

export const GENERIC_AUTH_ERROR = 'Something went wrong. Please try again.';

interface AuthClientError {
  message?: string;
  code?: string;
  rules?: unknown;
}

/** The message Better Auth returned, or a generic one when it gave none. */
export function authErrorMessage(error: AuthClientError | null | undefined, fallback = GENERIC_AUTH_ERROR): string {
  return error?.message || fallback;
}

export type PasswordRejectionCode = PasswordPolicyRule | typeof PASSWORD_COMPROMISED | typeof PASSWORD_CHECK_UNAVAILABLE;

/**
 * The codes to show when Better Auth rejected the password: the violated policy rules, or the breached-password
 * code (haveIBeenPwned), or the check-unavailable code when HIBP is down. Otherwise null. Render them with `passwordFieldErrors`.
 */
export function passwordRejectionCodes(error: AuthClientError | null | undefined): PasswordRejectionCode[] | null {
  if (error?.code === PASSWORD_COMPROMISED) return [PASSWORD_COMPROMISED];
  if (error?.code === PASSWORD_CHECK_UNAVAILABLE) return [PASSWORD_CHECK_UNAVAILABLE];
  if (error?.code !== PASSWORD_POLICY_VIOLATION && error?.message !== PASSWORD_POLICY_VIOLATION) return null;
  if (!Array.isArray(error.rules)) return null;
  const rules = error.rules.filter(isPasswordPolicyRule);
  return rules.length > 0 ? rules : null;
}

/** Toasts the error and returns true when a Better Auth client call failed. */
export function toastIfError(error: AuthClientError | null | undefined, fallback?: string): boolean {
  if (!error) return false;
  toast.error(authErrorMessage(error, fallback));
  return true;
}

/** Re-runs server loads so the layout picks up the new (or ended) session. */
export async function refreshSession(): Promise<void> {
  await invalidateAll();
}
