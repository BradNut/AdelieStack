import { DeployEnvironment, NodeEnv } from '@adelie/shared';
import { DrizzleQueryError } from 'drizzle-orm';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { requestId } from 'hono/request-id';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { type ErrorHandlerEnvs, errorHandler } from '#lib/server/api/common/middleware/error-handler.middleware';
import { requestLocale } from '#lib/server/api/common/middleware/locale.middleware';
import { Forbidden } from '#lib/server/api/common/utils/exceptions';
import type { HonoEnv } from '#lib/server/api/common/utils/hono';

const GENERIC_MESSAGE = 'Something went wrong on our side. Please try again later.';

const LOCAL_DEVELOPMENT: ErrorHandlerEnvs = { ENVIRONMENT: DeployEnvironment.DEVELOPMENT, NODE_ENV: NodeEnv.DEVELOPMENT };
const PRODUCTION: ErrorHandlerEnvs = { ENVIRONMENT: DeployEnvironment.PRODUCTION, NODE_ENV: NodeEnv.PRODUCTION };

interface ErrorLogEntry {
  level: number;
  msg: string;
  reqId: string;
  error: { type: string; message: string; stack: string; cause?: ErrorLogEntry['error'] };
}

const failure = () => new Error('connect ECONNREFUSED db.internal:5432 for SELECT * FROM users');

/** A real pino logger writing to memory, so assertions see exactly what would reach the log output. */
function captureLog() {
  const lines: string[] = [];
  const log = pino({ level: 'info' }, { write: (line: string) => lines.push(line) });
  return { log, output: () => lines.join(''), entries: () => lines.map((line) => JSON.parse(line) as ErrorLogEntry) };
}

/** An app whose one route throws `error`, answered by the error handler. */
function appThrowing(error: Error, envs: ErrorHandlerEnvs, log = pino({ enabled: false })) {
  return new Hono<HonoEnv>()
    .use(requestId())
    .use(contextStorage())
    .use(requestLocale)
    .get('/fail', () => {
      throw error;
    })
    .onError(errorHandler({ envs, logger: log }));
}

const HEADERS = { Cookie: 'better-auth.session_token=cookie-secret', Authorization: 'Bearer bearer-secret' };

describe('errorHandler response', () => {
  it.each<[string, ErrorHandlerEnvs]>([
    ['production', PRODUCTION],
    ['staging', { ENVIRONMENT: DeployEnvironment.STAGING, NODE_ENV: NodeEnv.PRODUCTION }],
    ['staging run as a development build', { ENVIRONMENT: DeployEnvironment.STAGING, NODE_ENV: NodeEnv.DEVELOPMENT }],
    // The image sets NODE_ENV=production but ENVIRONMENT defaults to development: a deploy that kept the default.
    ['a production build that kept the development default', { ENVIRONMENT: DeployEnvironment.DEVELOPMENT, NODE_ENV: NodeEnv.PRODUCTION }],
  ])('answers an unexpected error in %s with a generic message and the request id', async (_case, envs) => {
    const res = await appThrowing(failure(), envs).request('/fail');

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ message: GENERIC_MESSAGE, requestId: res.headers.get('x-request-id') });
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|db\.internal|SELECT|at /);
  });

  it('shows the error text and stack only in explicit local development', async () => {
    const error = failure();

    const res = await appThrowing(error, LOCAL_DEVELOPMENT).request('/fail');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ message: error.message, stack: error.stack, requestId: res.headers.get('x-request-id') });
  });

  it.each<[string, ErrorHandlerEnvs]>([
    ['production', PRODUCTION],
    ['local development', LOCAL_DEVELOPMENT],
  ])('keeps the status and message of a deliberate client error in %s', async (_case, envs) => {
    const res = await appThrowing(Forbidden('You may not do that'), envs).request('/fail');

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: 'You may not do that', requestId: res.headers.get('x-request-id') });
  });

  it('sends the stable code a deliberate client error carries', async () => {
    const res = await appThrowing(Forbidden('Enrol first', 'SOME_CODE'), PRODUCTION).request('/fail');

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: 'Enrol first', code: 'SOME_CODE', requestId: res.headers.get('x-request-id') });
  });

  it('does not log a deliberate client error', async () => {
    const { log, entries } = captureLog();

    await appThrowing(Forbidden('You may not do that'), PRODUCTION, log).request('/fail');

    expect(entries()).toEqual([]);
  });
});

describe('errorHandler logged detail', () => {
  async function failWith(error: Error) {
    const { log, output, entries } = captureLog();
    const res = await appThrowing(error, PRODUCTION, log).request('/fail', { headers: HEADERS });
    expect(entries()).toHaveLength(1);
    return { res, output: output(), entry: entries()[0] };
  }

  it('logs the full error with its stack against the request id', async () => {
    const error = failure();

    const { res, entry } = await failWith(error);

    expect(entry.level).toBe(50);
    expect(entry.msg).toBe('Unexpected error');
    expect(entry.reqId).toBe(res.headers.get('x-request-id'));
    expect(entry.error).toEqual({ type: 'Error', message: error.message, stack: error.stack });
  });

  it('keeps the request headers out of the logged error', async () => {
    const { output } = await failWith(failure());

    expect(output).not.toContain('cookie-secret');
    expect(output).not.toContain('bearer-secret');
  });

  it('redacts the password in a connection string', async () => {
    const { output, entry } = await failWith(new Error('could not connect to postgres://app:db-password-secret@db.internal:5432/app'));

    expect(output).not.toContain('db-password-secret');
    expect(entry.error.message).toBe('could not connect to postgres://[REDACTED]@db.internal:5432/app');
  });

  it('logs a failed query and its cause without the query parameters', async () => {
    const cause = new Error('relation "sessions" does not exist');
    const error = new DrizzleQueryError('select * from "sessions" where "token" = $1', ['session-token-secret'], cause);

    const { output, entry } = await failWith(error);

    expect(output).not.toContain('session-token-secret');
    expect(entry.error.message).toBe('Failed query: select * from "sessions" where "token" = $1\nparams: [REDACTED]');
    expect(entry.error.stack).toContain('select * from "sessions"');
    expect(entry.error.cause).toEqual({ type: 'Error', message: cause.message, stack: cause.stack });
  });

  it('stops following a cause chain that loops back on itself', async () => {
    const error = new Error('outer');
    error.cause = error;

    const { entry } = await failWith(error);

    let depth = 0;
    for (let cause = entry.error.cause; cause; cause = cause.cause) depth++;
    expect(depth).toBe(5);
  });
});
