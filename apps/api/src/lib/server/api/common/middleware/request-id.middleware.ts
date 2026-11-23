import { REQUEST_ID_HEADER } from '@adelie/shared';
import type { MiddlewareHandler } from 'hono';
import type { RequestIdVariables } from 'hono/request-id';
import { publicId } from '#lib/server/api/common/utils/crypto';

/**
 * Gives every request a fresh Public Id as its request id and answers with it in the `X-Request-Id` header. Unlike
 * Hono's `requestId`, an incoming `X-Request-Id` is never adopted: a caller could otherwise pick, repeat or reuse the
 * id that logs and error responses are correlated by (#273).
 */
export function serverRequestId(): MiddlewareHandler<{ Variables: RequestIdVariables }> {
  return async (c, next) => {
    const id = publicId();
    c.set('requestId', id);
    c.header(REQUEST_ID_HEADER, id);
    await next();
  };
}
