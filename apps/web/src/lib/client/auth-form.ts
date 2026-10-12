import { AUTH_ERROR_MESSAGES } from '@adelie/shared';
import { toast } from 'svelte-sonner';
import { invalidateAll } from '$app/navigation';

export const GENERIC_AUTH_ERROR = 'Something went wrong. Please try again.';

interface AuthClientError {
  code?: string;
  message?: string;
}

/** Our copy for the error's code when we have it, else the message Better Auth returned, else a generic one. */
export function authErrorMessage(error: AuthClientError | null | undefined, fallback = GENERIC_AUTH_ERROR): string {
  return (error?.code && AUTH_ERROR_MESSAGES[error.code]) || error?.message || fallback;
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
