# API Error Handling Standards

Every error that leaves a route goes through one handler, `errorHandler` in
`apps/api/src/lib/server/api/common/middleware/error-handler.middleware.ts`, registered with `.onError` in
`application.controller.ts`. It decides what the client sees and what is logged.

## Error Response Format

The body is always a message and the request id; the same id is in the `X-Request-Id` response header and in the log.

```typescript
{
  "message": "Human-readable, localised message",
  "requestId": "<request id>" // quote it to find the log entry
}
```

There is no `details` or `meta` envelope, and no error `code` except the one narrow case below. A client that needs
to branch on a failure branches on the status. (Better Auth's own endpoints are the other exception; see below.)

### Coded errors (`CodedHTTPException`)

One refusal shares a status with others but must be told apart by the client: a permission-guarded route refusing an
admin without a Second Factor (`403`, like any other forbidden request), which the web app answers by sending the
admin to enrolment, not to an error page ([ADR 0014](../../../docs/adr/0014-admin-capabilities-require-a-second-factor.md)).
For that, and only for refusals whose code Better Auth's endpoints also answer, a route throws
`Forbidden(message, code)` (a `CodedHTTPException`) with an `AuthErrorCode` from `@adelie/shared`, and the body gains
a `code` beside the message:

```typescript
{ "message": "...", "code": "SECOND_FACTOR_REQUIRED", "requestId": "..." }
```

The code is typed `AuthErrorCode`, never a free string. Add a new code here only with an ADR that needs it.

### Deliberate errors (`HTTPException`)

A route or service that means to refuse a request throws an `HTTPException`, using the helpers in
`common/utils/exceptions.ts` (`BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `UnprocessableEntity`,
`TooManyRequests`, ...). The status and message go to the client as thrown, in every environment, and nothing is
logged as a failure. So the message is written for the client: localise it with `m.*()`, and never put internal
detail in it.

```typescript
if (!allowed) throw Forbidden(m.auth_role_forbidden());
```

### Unexpected errors (anything else)

Anything that is not an `HTTPException` (a failed query, a driver or socket error, a bug) is answered `500` with the
generic localised `server_unexpected_error` message and the request id. The error's text and stack never reach the
client, since they can hold SQL, parameters or internal hosts.

Only explicit local development, `isLocalDevEnv` from `@adelie/shared` (`ENVIRONMENT=development` and
`NODE_ENV=development`), adds them back for debugging:

```typescript
{ "message": "<the error's message>", "stack": "<the error's stack>", "requestId": "..." }
```

`ENV=dev` alone is not enough: it is the schema default, and the images set only `NODE_ENV=production`.

Do not catch an unexpected error just to rethrow `InternalError(...)` with its text; let it reach the handler. Catch
only to turn a known condition into a deliberate error (for example a unique-constraint violation into `409`), or to
record it and degrade gracefully.

### Better Auth (`/api/auth/*`)

Better Auth answers its own deliberate errors (`APIError`) with its own body: a status plus a `code` such as
`INVALID_EMAIL_OR_PASSWORD` and a `message`. Anything else thrown inside it is rethrown to `errorHandler`
(`onAPIError: { throw: true }` in `auth.config.ts`), so it gets the same generic 500 and log entry as any route.

## Error Logging

An unexpected error is logged once, at `error` level, with the fixed message `Unexpected error`:

```json
{ "level": 50, "msg": "Unexpected error", "reqId": "...", "error": { "type": "DrizzleQueryError", "message": "...", "stack": "...", "cause": { ... } } }
```

- The cause chain is followed up to five levels, so a query error shows the driver error under it.
- Credentials are redacted (`[REDACTED]`, from `common/utils/log-redaction.ts`): the user and password in a connection
  string, and a `DrizzleQueryError`'s parameters, which can hold tokens and password hashes.
- The error is serialised by hand under `error`, not through pino's `err` serializer, which copies every own
  property (such as `params`).
- No request headers, cookies or bodies are logged. The request logger writes its own allow-listed entry for the same
  request id.

Never log passwords, session or reset tokens, secrets, or personal data, in an error or anywhere else.

## Testing Error Handling

- The handler's own behaviour (environment gating, redaction, cause chain) is tested in
  `common/middleware/tests/error-handler.middleware.test.ts`; its wiring in `tests/application.controller.test.ts`.
- For a route, test the deliberate errors it throws (status and message) and that an unexpected failure is a generic
  500, not that a particular log line was written.
- Use a real pino logger writing to memory to assert what reaches the log, including that a secret does not.

## Related Documentation

- [API Conventions](./api-conventions.md)
- [Security Standards](./security-standards.md)
- [Testing Standards](./testing-standards.md)
