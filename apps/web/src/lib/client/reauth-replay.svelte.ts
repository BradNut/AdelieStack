/** Actions that can run again after the provider round trip. Each carries only non-secret identifiers. */
export const ReplayActionKey = {
  UNLINK_ACCOUNT: 'unlink-account',
} as const;
export type ReplayActionKey = (typeof ReplayActionKey)[keyof typeof ReplayActionKey];

/** The arguments each replayable action takes; never credentials or tokens. */
interface ReplayArgs {
  [ReplayActionKey.UNLINK_ACCOUNT]: { accountId: string };
}

/** What a stale action registers so it can run again after re-authentication. */
export type ReplayRequest = { [K in ReplayActionKey]: { key: K; args: ReplayArgs[K] } }[ReplayActionKey];

/** The `sessionStorage` key holding the one pending entry. */
export const PENDING_REAUTH_STORAGE_KEY = 'adelie.reauth.pending';

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
