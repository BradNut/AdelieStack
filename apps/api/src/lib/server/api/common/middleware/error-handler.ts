import { AppEnv, StatusCodes } from '@adelie/shared';
import { DrizzleQueryError } from 'drizzle-orm';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Logger } from 'pino';
import { m } from '#lib/server/api/common/i18n/index';
import { REDACTED } from './request-logger.middleware';

/** Fixed, so the entry's `msg` never repeats the error's free text. */
const UNEXPECTED_ERROR_MESSAGE = 'Unexpected error';

/** The user and password a connection string carries before its host (`postgres://user:password@host`). */
const URL_CREDENTIALS_PATTERN = /\b([a-z][a-z\d+.-]*:\/\/)[^\s/@]+@/gi;

/** Deep enough for a query error wrapping a driver error wrapping a socket error, and bounded against a cycle. */
const MAX_LOGGED_CAUSES = 5;

interface ErrorHandlerOptions {
  /** The API's `ENV` switch. Only an explicit `dev` shows error detail; any other or missing value hides it. */
  env: string | undefined;
  logger: Logger;
}

interface LoggedError {
  type: string;
  message: string;
  stack: string | undefined;
  cause?: LoggedError;
}

/** `error`'s text with the credentials it may hold replaced: a connection string's user and password, a query's parameters. */
function redacted(error: Error, text: string): string {
  let result = text.replace(URL_CREDENTIALS_PATTERN, `$1${REDACTED}@`);
  // Parameters hold the values a query was run with: tokens, password hashes, personal data.
  if (error instanceof DrizzleQueryError) result = result.replaceAll(`params: ${error.params}`, `params: ${REDACTED}`);
  return result;
}

/**
 * The error to log: type, message, stack and cause chain, each redacted. Built by hand rather than with pino's error
 * serializer, which copies every own property (such as a query error's `params`), so it is logged under `error`, not `err`.
 */
function loggedError(error: Error, depth = 0): LoggedError {
  const entry: LoggedError = {
    type: error.constructor?.name || error.name,
    message: redacted(error, error.message),
    stack: error.stack === undefined ? undefined : redacted(error, error.stack),
  };
  if (error.cause instanceof Error && depth < MAX_LOGGED_CAUSES) entry.cause = loggedError(error.cause, depth + 1);
  return entry;
}

/**
 * Answers an error no handler caught. An unexpected error gets a generic, localised message and the request id, so
 * a client never sees the error text or stack, which can hold SQL, parameters or internal hosts. Only explicit local
 * development adds them back, for debugging. The full error is logged against the request id, with credentials
 * redacted and no request headers. A deliberate `HTTPException` keeps its status and message everywhere.
 */
export function errorHandler({ env, logger }: ErrorHandlerOptions): ErrorHandler {
  const showDetail = env === AppEnv.DEV;

  return (error, c) => {
    const requestId: string = c.get('requestId');
    // A deliberate error chose its status and message for the client, so both go out as thrown.
    if (error instanceof HTTPException) return c.json({ message: error.message, requestId }, error.status);

    logger.error({ reqId: requestId, error: loggedError(error) }, UNEXPECTED_ERROR_MESSAGE);

    const body = showDetail ? { message: error.message, stack: error.stack, requestId } : { message: m.server_unexpected_error(), requestId };
    return c.json(body, StatusCodes.INTERNAL_SERVER_ERROR);
  };
}
