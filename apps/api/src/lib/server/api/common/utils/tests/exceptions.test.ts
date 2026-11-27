import { AuthErrorCode, StatusCodes, StorageErrorCode } from '@adelie/shared';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import { CodedHTTPException, Forbidden, Gone, InternalError, TooEarly } from '#lib/server/api/common/utils/exceptions';

const MESSAGE = 'Refused for a reason';

describe('coded exception helpers', () => {
  it.each([
    ['Forbidden', Forbidden, StatusCodes.FORBIDDEN, AuthErrorCode.SECOND_FACTOR_REQUIRED],
    ['Forbidden', Forbidden, StatusCodes.FORBIDDEN, StorageErrorCode.SCAN_REFUSED],
    ['TooEarly', TooEarly, StatusCodes.TOO_EARLY, StorageErrorCode.SCAN_PENDING],
    ['Gone', Gone, StatusCodes.GONE, StorageErrorCode.SCAN_INFECTED],
    ['InternalError', InternalError, StatusCodes.INTERNAL_SERVER_ERROR, StorageErrorCode.SCAN_FAILED],
  ] as const)('%s with a code carries its status, the code and the message', (_name, helper, status, code) => {
    const error = helper(MESSAGE, code);

    expect(error).toBeInstanceOf(CodedHTTPException);
    expect(error.status).toBe(status);
    expect((error as CodedHTTPException).code).toBe(code);
    expect(error.message).toBe(MESSAGE);
  });

  it.each([
    ['Forbidden', Forbidden, StatusCodes.FORBIDDEN, 'Forbidden'],
    ['TooEarly', TooEarly, StatusCodes.TOO_EARLY, 'Too Early'],
    ['Gone', Gone, StatusCodes.GONE, 'Gone'],
    ['InternalError', InternalError, StatusCodes.INTERNAL_SERVER_ERROR, 'Internal Error'],
  ] as const)('%s without a code is a plain HTTPException with its default message', (_name, helper, status, message) => {
    const error = helper();

    expect(error).toBeInstanceOf(HTTPException);
    expect(error).not.toBeInstanceOf(CodedHTTPException);
    expect(error.status).toBe(status);
    expect(error.message).toBe(message);
  });
});
