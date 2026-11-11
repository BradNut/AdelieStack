import { StatusCodes } from '@adelie/shared';
import { HTTPException } from 'hono/http-exception';

export function TooManyRequests(message = 'Too many requests') {
  return new HTTPException(StatusCodes.TOO_MANY_REQUESTS, { message });
}

/**
 * A deliberate error with a stable, client-visible code (from `@adelie/shared`, e.g. `AuthErrorCode`) next to its
 * message, so a client can act on it without matching text. The error handler sends the code as `code`.
 */
export class CodedHTTPException extends HTTPException {
  constructor(
    status: ConstructorParameters<typeof HTTPException>[0],
    readonly code: string,
    message: string,
  ) {
    super(status, { message });
  }
}

/** 403. With `code`, the response carries it for the client to act on. */
export function Forbidden(message = 'Forbidden', code?: string) {
  return code ? new CodedHTTPException(StatusCodes.FORBIDDEN, code, message) : new HTTPException(StatusCodes.FORBIDDEN, { message });
}

export function Unauthorized(message = 'Unauthorized') {
  return new HTTPException(StatusCodes.UNAUTHORIZED, { message });
}

export function NotFound(message = 'Not Found') {
  return new HTTPException(StatusCodes.NOT_FOUND, { message });
}

export function BadRequest(message = 'Bad Request') {
  return new HTTPException(StatusCodes.BAD_REQUEST, { message });
}

export function PayloadTooLarge(message = 'Payload Too Large') {
  return new HTTPException(StatusCodes.REQUEST_TOO_LONG, { message });
}

export function UnsupportedMediaType(message = 'Unsupported Media Type') {
  return new HTTPException(StatusCodes.UNSUPPORTED_MEDIA_TYPE, { message });
}

export function UnprocessableEntity(message = 'Unprocessable Entity') {
  return new HTTPException(StatusCodes.UNPROCESSABLE_ENTITY, { message });
}

export function InternalError(message = 'Internal Error') {
  return new HTTPException(StatusCodes.INTERNAL_SERVER_ERROR, { message });
}
