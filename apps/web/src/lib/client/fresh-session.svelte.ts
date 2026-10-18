import { AuthErrorCode } from '@adelie/shared';
import { refreshSession } from '#lib/client/auth-form.ts';

/** How the re-authentication prompt ended. */
export const ReauthOutcome = {
  CONFIRMED: 'confirmed',
  DISMISSED: 'dismissed',
} as const;
export type ReauthOutcome = (typeof ReauthOutcome)[keyof typeof ReauthOutcome];

interface ReauthState {
  open: boolean;
  /** Opens the shared prompt (or joins the one already open) and resolves once it ends. Never rejects. */
  request(): Promise<ReauthOutcome>;
  /** Called by the prompt when it ends; closes it and releases everything waiting on it. */
  settle(outcome: ReauthOutcome): void;
}

function createFreshSession(): ReauthState {
  let open = $state(false);
  let pending: Promise<ReauthOutcome> | null = null;
  let release: ((outcome: ReauthOutcome) => void) | null = null;

  return {
    get open() {
      return open;
    },
    request() {
      pending ??= new Promise<ReauthOutcome>((resolve) => {
        release = resolve;
        open = true;
      });
      return pending;
    },
    settle(outcome) {
      open = false;
      release?.(outcome);
      pending = null;
      release = null;
    },
  };
}

/** The one re-authentication prompt, mounted once in the app layout. */
export const freshSession = createFreshSession();

interface AuthResult {
  error?: { code?: string } | null;
}

/**
 * Runs a Better Auth call that needs a fresh session. When it fails with `SESSION_NOT_FRESH` the user is asked to
 * sign in again; on success the call is retried once and the session is refreshed. If the prompt is dismissed, the
 * original not-fresh result is returned, so callers show their normal failure.
 */
export async function withFreshSession<T extends AuthResult>(action: () => Promise<T>): Promise<T> {
  const result = await action();
  if (result.error?.code !== AuthErrorCode.SESSION_NOT_FRESH) return result;

  const outcome = await freshSession.request();
  if (outcome !== ReauthOutcome.CONFIRMED) return result;

  const retried = await action();
  if (!retried.error) await refreshSession();
  return retried;
}
