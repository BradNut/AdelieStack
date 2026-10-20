import { AuthErrorCode, StatusCodes } from '@adelie/shared';

/** What a Better Auth client call resolves with when the session is too old for a sensitive action. */
export const NOT_FRESH = {
  data: null,
  error: { status: StatusCodes.FORBIDDEN, code: AuthErrorCode.SESSION_NOT_FRESH, message: 'Session is not fresh' },
};
