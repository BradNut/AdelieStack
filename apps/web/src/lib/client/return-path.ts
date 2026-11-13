import { AppRoute, RETURN_TO_PARAM, SOCIAL_ERROR_PARAM } from '@adelie/shared';

/** True for a same-origin relative path; protocol-relative (`//host`) and backslash forms are refused. */
export function isInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\');
}

/** The path and query of the current page without a provider `?error=`, always an app-internal relative path. */
export function currentReturnPath(location: Pick<Location, 'pathname' | 'search'>): string {
  const params = new URLSearchParams(location.search);
  params.delete(SOCIAL_ERROR_PARAM);
  const query = params.toString();
  const path = `${location.pathname}${query ? `?${query}` : ''}`;
  return isInternalPath(path) ? path : AppRoute.HOME;
}

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
