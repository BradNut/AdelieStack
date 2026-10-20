import { AppRoute, RETURN_TO_PARAM } from '@adelie/shared';
import { isInternalPath } from '#lib/client/social-auth.ts';

/** `path` with a `?returnTo=` naming the app-internal page to come back to once signed in. */
export function withReturnPath(path: string, returnTo: string): string {
  if (!isInternalPath(returnTo) || returnTo === AppRoute.HOME) return path;
  return `${path}?${new URLSearchParams({ [RETURN_TO_PARAM]: returnTo })}`;
}

/** The page a sign-in page should finish on: its `?returnTo=` when that is app-internal, else home. */
export function returnPathFrom(params: Pick<URLSearchParams, 'get'>): string {
  const returnTo = params.get(RETURN_TO_PARAM);
  return returnTo && isInternalPath(returnTo) ? returnTo : AppRoute.HOME;
}
