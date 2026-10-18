import { isSocialProvider, SOCIAL_PROVIDER_LABELS } from '@adelie/shared';
import { toast } from 'svelte-sonner';
import { toastIfError } from '#lib/client/auth-form.ts';
import * as m from '#lib/paraglide/messages.js';

/** A provider's display name for a Better Auth provider id; unknown ids show as they are. */
export function providerLabel(providerId: string): string {
  return isSocialProvider(providerId) ? SOCIAL_PROVIDER_LABELS[providerId] : providerId;
}

/** Shows the outcome of unlinking an account: the error, or a success message. Returns true on success. */
export function notifyUnlinked(error: Parameters<typeof toastIfError>[0], label: string): boolean {
  if (toastIfError(error, m.connected_accounts_unlink_failed())) return false;
  toast.success(m.connected_accounts_unlinked({ provider: label }));
  return true;
}
