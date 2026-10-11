import { PASSWORD_POLICY_RULES, PASSWORD_POLICY_VIOLATION, type PasswordPolicyRule } from '@adelie/shared';
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

const KNOWN_RULES: ReadonlySet<unknown> = new Set(Object.values(PASSWORD_POLICY_RULES));

/** The violated password rules when Better Auth rejected the password by policy, otherwise null. Render them with `passwordFieldErrors`. */
export function passwordPolicyViolationRules(error: AuthClientError | null | undefined): PasswordPolicyRule[] | null {
  if (error?.code !== PASSWORD_POLICY_VIOLATION && error?.message !== PASSWORD_POLICY_VIOLATION) return null;
  if (!Array.isArray(error.rules)) return null;
  const rules = error.rules.filter((rule): rule is PasswordPolicyRule => KNOWN_RULES.has(rule));
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
