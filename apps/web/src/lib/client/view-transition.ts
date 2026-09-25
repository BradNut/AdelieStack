import type { OnNavigate } from '@sveltejs/kit';

/**
 * Wraps a client-side navigation in the View Transitions API when the browser supports it.
 * Pass directly to `onNavigate`. Browser-only: touches `document`.
 */
export function startViewTransition(navigation: OnNavigate): Promise<void> | undefined {
  if (!document.startViewTransition) return;

  return new Promise((captureOldState) => {
    document.startViewTransition(async () => {
      captureOldState();
      await navigation.complete;
    });
  });
}
