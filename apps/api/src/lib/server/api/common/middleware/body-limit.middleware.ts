import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { matchedRoutes } from 'hono/route';
import { m } from '#lib/server/api/common/i18n/index';
import { PayloadTooLarge } from '#lib/server/api/common/utils/exceptions';

/** The limit each `declareBodyLimit` marker declares, looked up by the marker's identity among the matched routes. */
const declaredLimits = new WeakMap<object, number>();

/**
 * Marks a route as accepting bodies up to `maxBytes` instead of the default, e.g. an upload route sized from
 * `MAX_UPLOAD_SIZE_BYTES`. Place it before the route's handler; it does nothing itself, `requestBodyLimit` reads it.
 */
export function declareBodyLimit(maxBytes: number): MiddlewareHandler {
  const marker: MiddlewareHandler = (_c, next) => next();
  declaredLimits.set(marker, maxBytes);
  return marker;
}

/**
 * Refuses a request body larger than `defaultMaxBytes` (or the matched route's `declareBodyLimit`) with a localised
 * 413, before any handler reads it. A declared `Content-Length` over the limit is refused unread; a body without one
 * (chunked) is counted as it streams and refused as soon as it passes the limit, so at most the limit is ever held.
 */
export function requestBodyLimit(defaultMaxBytes: number): MiddlewareHandler {
  return (c, next) => {
    // The innermost declaration wins, so a route can narrow a limit declared further out.
    const declared = matchedRoutes(c)
      .flatMap(({ handler }) => declaredLimits.get(handler) ?? [])
      .at(-1);
    const limit = bodyLimit({
      maxSize: declared ?? defaultMaxBytes,
      onError: () => {
        throw PayloadTooLarge(m.request_body_too_large());
      },
    });
    return limit(c, next);
  };
}
