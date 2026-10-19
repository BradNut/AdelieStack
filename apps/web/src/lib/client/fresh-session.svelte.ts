import { AuthErrorCode } from '@adelie/shared';
import { refreshSession } from '#lib/client/auth-form.ts';
import type { ReplayRequest } from '#lib/client/reauth-replay.svelte.ts';

/** How the re-authentication prompt ended. */
export const ReauthOutcome = {
  CONFIRMED: 'confirmed',
  DISMISSED: 'dismissed',
} as const;
export type ReauthOutcome = (typeof ReauthOutcome)[keyof typeof ReauthOutcome];

interface ReauthState {
  open: boolean;
  /** The action to run again if the user leaves for a provider to re-authenticate; null when it cannot be replayed. */
  replay: ReplayRequest | null;
  /** Opens the shared prompt (or joins the one already open) and resolves once it ends. Never rejects. */
  request(replay?: ReplayRequest): Promise<ReauthOutcome>;
  /** Called by the prompt when it ends; closes it and releases everything waiting on it. */
  settle(outcome: ReauthOutcome): void;
}

function createFreshSession(): ReauthState {
  let open = $state(false);
  let replay = $state<ReplayRequest | null>(null);
  let pending: Promise<ReauthOutcome> | null = null;
  let release: ((outcome: ReauthOutcome) => void) | null = null;

  return {
    get open() {
      return open;
    },
    get replay() {
      return replay;
    },
    request(requested) {
      // Concurrent stale actions share one prompt; the first replayable one is what a provider round trip replays.
      replay ??= requested ?? null;
      pending ??= new Promise<ReauthOutcome>((resolve) => {
        release = resolve;
        open = true;
      });
      return pending;
    },
    settle(outcome) {
      open = false;
      replay = null;
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
 * original not-fresh result is returned, so callers show their normal failure. Pass `replay` when the action is
 * registered, so it can run again after a provider re-authentication, which reloads the page.
 */
export async function withFreshSession<T extends AuthResult>(action: () => Promise<T>, replay?: ReplayRequest): Promise<T> {
  const result = await action();
  if (result.error?.code !== AuthErrorCode.SESSION_NOT_FRESH) return result;

  const outcome = await freshSession.request(replay);
  if (outcome !== ReauthOutcome.CONFIRMED) return result;

  const retried = await action();
  if (!retried.error) await refreshSession();
  return retried;
}
