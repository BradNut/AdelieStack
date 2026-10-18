/** Actions that can run again after a provider re-authentication. The value is what is stored for the action. */
export const ReplayActionKey = {
  UNLINK_ACCOUNT: 'unlink-account',
} as const;
export type ReplayActionKey = (typeof ReplayActionKey)[keyof typeof ReplayActionKey];

/** The `sessionStorage` key holding the one pending provider re-authentication entry. */
export const PENDING_REAUTH_STORAGE_KEY = 'adelie.reauth.pending';
