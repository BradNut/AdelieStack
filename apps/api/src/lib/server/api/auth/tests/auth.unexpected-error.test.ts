import { APP_NAME, AUTH_BASE_PATH, DeployEnvironment, NodeEnv } from '@adelie/shared';
import { DrizzleQueryError } from 'drizzle-orm';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { requestId } from 'hono/request-id';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuth } from '#lib/server/api/auth/auth.config';
import { createHibpHealth } from '#lib/server/api/auth/auth.hibp-status';
import { errorHandler } from '#lib/server/api/common/middleware/error-handler.middleware';
import { requestLocale } from '#lib/server/api/common/middleware/locale.middleware';
import type { HonoEnv } from '#lib/server/api/common/utils/hono';
import { TEST_USER } from '../../../../../test/auth-http';
import { createTestDatabase, TEST_ORIGIN } from '../../../../../test/auth-instance';
import { createMailerServiceMock } from '../../../../../test/mocks/mailer.mock';

/** A query error as Drizzle raises it, its parameters holding a session token. */
const queryFailure = () =>
  new DrizzleQueryError('select * from "users" where "email" = $1', ['session-token-secret'], new Error('connection terminated unexpectedly'));

/** The real auth instance mounted like the API mounts it; with `failing`, its `users` table fails every query. */
function mountedAuth(log: pino.Logger, failing = true) {
  const { db, database } = createTestDatabase();
  if (failing) {
    Object.defineProperty(db, 'user', {
      get() {
        throw queryFailure();
      },
    });
  }
  const auth = createAuth({
    database,
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: TEST_ORIGIN,
    trustedOrigins: [TEST_ORIGIN],
    twoFactorIssuer: APP_NAME,
    passkey: { rpID: 'localhost', rpName: APP_NAME, origin: TEST_ORIGIN },
    mailer: createMailerServiceMock(),
    signUpEnabled: true,
    hibpStatus: createHibpHealth({ enabled: false }),
  });
  return new Hono<HonoEnv>()
    .use(requestId())
    .use(contextStorage())
    .use(requestLocale)
    .on(['GET', 'POST'], `${AUTH_BASE_PATH}/*`, (c) => auth.handler(c.req.raw))
    .onError(errorHandler({ envs: { ENVIRONMENT: DeployEnvironment.PRODUCTION, NODE_ENV: NodeEnv.PRODUCTION }, logger: log }));
}

function signIn(app: Hono<HonoEnv>) {
  return app.request(`${AUTH_BASE_PATH}/sign-in/email`, {
    method: 'POST',
    headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
  });
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('an unexpected error inside a Better Auth endpoint', () => {
  it('answers with the generic message and the request id, like any other route', async () => {
    const res = await signIn(mountedAuth(pino({ enabled: false })));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ message: 'Something went wrong on our side. Please try again later.', requestId: res.headers.get('x-request-id') });
    expect(JSON.stringify(body)).not.toMatch(/session-token-secret|select|connection terminated/);
  });

  it('is logged once through the redacting error log, against the request id', async () => {
    const lines: string[] = [];
    const log = pino({ level: 'info' }, { write: (line: string) => lines.push(line) });

    const res = await signIn(mountedAuth(log));

    const entries = lines.map((line) => JSON.parse(line) as { msg: string; reqId: string; error: { message: string; cause?: { message: string } } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ msg: 'Unexpected error', reqId: res.headers.get('x-request-id') });
    expect(entries[0].error.message).toBe('Failed query: select * from "users" where "email" = $1\nparams: [REDACTED]');
    expect(entries[0].error.cause?.message).toBe('connection terminated unexpectedly');
    expect(lines.join('')).not.toContain('session-token-secret');
  });

  it('is not printed unredacted to the console by Better Auth', async () => {
    await signIn(mountedAuth(pino({ enabled: false })));

    expect(JSON.stringify(consoleError.mock.calls.map((call) => call.map(String)))).not.toContain('session-token-secret');
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('SERVER_ERROR'), expect.anything());
  });
});

describe('a deliberate Better Auth error', () => {
  it('is still answered by Better Auth with its own status and code, and not logged as unexpected', async () => {
    const lines: string[] = [];
    const log = pino({ level: 'info' }, { write: (line: string) => lines.push(line) });

    const res = await signIn(mountedAuth(log, false));

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'INVALID_EMAIL_OR_PASSWORD' });
    expect(lines).toEqual([]);
  });
});
