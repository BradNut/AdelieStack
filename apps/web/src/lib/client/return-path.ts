import { AppRoute, RETURN_TO_PARAM, SOCIAL_ERROR_PARAM } from '@adelie/shared';

/** Stands in for the app's origin when resolving a path; any origin works, since only a change of origin matters. */
const RESOLUTION_ORIGIN = 'http://app.invalid';

/** C0 controls, DEL and C1 controls: URL parsing strips some of them, so they can change where a value resolves. */
function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** The value decoded once, or null when its percent-encoding is malformed. */
function decoded(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** True for a control-free value starting with `/` that the browser resolves on the app's own origin. */
function resolvesInternally(value: string): boolean {
  if (!value.startsWith('/') || hasControlCharacter(value)) return false;
  return new URL(value, RESOLUTION_ORIGIN).origin === RESOLUTION_ORIGIN;
}

/**
 * True for a page of this app: the value, raw and percent-decoded, holds no control character and resolves on the
 * app's origin, so protocol-relative (`//host`), backslash and encoded forms of either are refused.
 */
export function isInternalPath(path: string): boolean {
  const decodedPath = decoded(path);
  return decodedPath !== null && resolvesInternally(path) && resolvesInternally(decodedPath);
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
