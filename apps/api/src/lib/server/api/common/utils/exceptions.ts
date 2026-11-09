import { StatusCodes } from '@adelie/shared';
import { HTTPException } from 'hono/http-exception';

export function TooManyRequests(message = 'Too many requests') {
  return new HTTPException(StatusCodes.TOO_MANY_REQUESTS, { message });
}

export function Forbidden(message = 'Forbidden') {
  return new HTTPException(StatusCodes.FORBIDDEN, { message });
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
