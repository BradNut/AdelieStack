import { PENDING_REAUTH_STORAGE_KEY, ReplayActionKey } from '@adelie/shared';
import { toast } from 'svelte-sonner';
import { authClient } from '#lib/auth-client.ts';
import { notifyUnlinked, providerLabel } from '#lib/client/connected-accounts.ts';
import * as m from '#lib/paraglide/messages.js';

// Defined in shared so the e2e specs can name them too.
export { PENDING_REAUTH_STORAGE_KEY, ReplayActionKey };

/** The arguments each replayable action takes; never credentials or tokens. */
interface ReplayArgs {
  [ReplayActionKey.UNLINK_ACCOUNT]: { accountId: string };
}

/** What a stale action registers so it can run again after re-authentication. */
export type ReplayRequest = { [K in ReplayActionKey]: { key: K; args: ReplayArgs[K] } }[ReplayActionKey];

/** A stored entry older than this is dropped instead of replayed. */
export const REPLAY_MAX_AGE_MS = 10 * 60 * 1000;

/** What survives the full-page navigation to the provider. `action` is null when the stale call is not replayable. */
export interface PendingReauth {
  action: ReplayRequest | null;
  userId: string;
  at: number;
}

/** Stores the entry, replacing any earlier one. Call before leaving for the provider. */
export function savePendingReauth(action: ReplayRequest | null, userId: string): void {
  const entry: PendingReauth = { action, userId, at: Date.now() };
  sessionStorage.setItem(PENDING_REAUTH_STORAGE_KEY, JSON.stringify(entry));
}

/** Drops the pending entry. */
export function clearPendingReauth(): void {
  sessionStorage.removeItem(PENDING_REAUTH_STORAGE_KEY);
}

/** Count of actions replayed after re-authentication; a page that already loaded its data reads it to know when to reload. */
export const replayProgress = $state({ replayedCount: 0 });

/** Every replayable action: runs it with its stored arguments and shows its normal success or error message. */
const REPLAYABLE_ACTIONS: { [K in ReplayActionKey]: (args: ReplayArgs[K]) => Promise<void> } = {
  async [ReplayActionKey.UNLINK_ACCOUNT]({ accountId }) {
    try {
      const { data: accounts } = await authClient.listAccounts();
      const account = accounts?.find((row) => row.id === accountId);
      // Already unlinked, e.g. from another tab: nothing is left to do.
      if (!account) return;
      const { error } = await authClient.unlinkAccount({ accountId });
      notifyUnlinked(error, providerLabel(account.providerId));
    } catch {
      // A thrown network error: nothing returned an error object, so show the action's own failure message.
      toast.error(m.connected_accounts_unlink_failed());
    }
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The action as stored, null for "not replayable", or undefined when it is not something this code registered. */
function parseAction(value: unknown): ReplayRequest | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isRecord(value.args)) return undefined;
  if (value.key === ReplayActionKey.UNLINK_ACCOUNT && typeof value.args.accountId === 'string') {
    return { key: value.key, args: { accountId: value.args.accountId } };
  }
  return undefined;
}

/** The stored entry, or null when it is missing or does not have the shape this code wrote. */
function parsePending(raw: string): PendingReauth | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.userId !== 'string' || typeof value.at !== 'number') return null;
    const action = parseAction(value.action);
    return action === undefined ? null : { action, userId: value.userId, at: value.at };
  } catch {
    return null;
  }
}

function runAction(action: ReplayRequest): Promise<void> {
  switch (action.key) {
    case ReplayActionKey.UNLINK_ACCOUNT:
      return REPLAYABLE_ACTIONS[action.key](action.args);
  }
}

interface ReplayContext {
  /** The signed-in user after the round trip; null when nobody is. */
  userId: string | null;
  /** Translated copy for the provider error the page came back with, or null when there was none. */
  providerError: string | null;
}

/**
 * Finishes a provider re-authentication after the page reloads. The entry is cleared first, so it can only run once,
 * and dropped on every outcome: a provider error, another user, an old entry. A provider error is toasted once even
 * with no entry. The action runs only for the same user.
 */
export async function replayPendingReauth({ userId, providerError }: ReplayContext): Promise<void> {
  const raw = sessionStorage.getItem(PENDING_REAUTH_STORAGE_KEY);
  clearPendingReauth();
  // The layout is the one place a provider error becomes a toast, whether or not an entry was waiting (a plain link
  // or sign-in that failed has none).
  if (providerError) {
    toast.error(providerError);
    return;
  }
  if (raw === null) return;
  const pending = parsePending(raw);
  if (!pending || Date.now() - pending.at > REPLAY_MAX_AGE_MS) return;
  if (userId !== pending.userId) {
    toast.error(m.reauth_provider_mismatch());
    return;
  }
  if (!pending.action) {
    toast.info(m.reauth_done_try_again());
    return;
  }
  await runAction(pending.action);
  replayProgress.replayedCount += 1;
}
