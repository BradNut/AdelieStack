import { type AuthErrorCode, StatusCodes, type StorageErrorCode } from '@adelie/shared';
import { HTTPException } from 'hono/http-exception';

export function TooManyRequests(message = 'Too many requests') {
  return new HTTPException(StatusCodes.TOO_MANY_REQUESTS, { message });
}

type ErrorStatus = ConstructorParameters<typeof HTTPException>[0];

/** A stable, client-visible error code from `@adelie/shared`. */
export type ErrorCode = AuthErrorCode | StorageErrorCode;

/**
 * A deliberate error with a stable, client-visible code (an `AuthErrorCode` or `StorageErrorCode` from `@adelie/shared`)
 * next to its message, so a client can act on it without matching text. The error handler sends the code as `code`.
 */
export class CodedHTTPException extends HTTPException {
  constructor(
    status: ErrorStatus,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(status, { message });
  }
}

/** A `CodedHTTPException` when there is a `code`, else a plain `HTTPException`. */
const httpError = (status: ErrorStatus, message: string, code?: ErrorCode): HTTPException =>
  code ? new CodedHTTPException(status, code, message) : new HTTPException(status, { message });

/** 403. With `code`, the response carries it for the client to act on. */
export function Forbidden(message = 'Forbidden', code?: ErrorCode) {
  return httpError(StatusCodes.FORBIDDEN, message, code);
}

/** 425: not ready yet, try again later. With `code`, the response carries it for the client to act on. */
export function TooEarly(message = 'Too Early', code?: ErrorCode) {
  return httpError(StatusCodes.TOO_EARLY, message, code);
}

/** 410: gone for good. With `code`, the response carries it for the client to act on. */
export function Gone(message = 'Gone', code?: ErrorCode) {
  return httpError(StatusCodes.GONE, message, code);
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

export function Conflict(message = 'Conflict') {
  return new HTTPException(StatusCodes.CONFLICT, { message });
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

/** 500. With `code`, the response carries it for the client to tell a known failure from an unexpected one. */
export function InternalError(message = 'Internal Error', code?: ErrorCode) {
  return httpError(StatusCodes.INTERNAL_SERVER_ERROR, message, code);
}
