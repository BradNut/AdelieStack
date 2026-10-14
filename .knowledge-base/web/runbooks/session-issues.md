# Session Issues

Auth uses session cookies set by the API via `Set-Cookie` headers forwarded through the proxy.

## Symptoms

- User logs in but immediately lands back on login page
- Session lost on page reload
- Cookie not sent with requests
- `401` after login succeeds

## Diagnosis

### 1. Check the request origin and `DOMAIN`

```bash
echo $BETTER_AUTH_URL   # https://example.com  (exact match to browser URL)
echo $DOMAIN            # example.com          (no protocol, no trailing slash)
```

The web server derives its origin from the request (or the build-time `WEB_ORIGIN`); it no longer reads `ORIGIN`. See [Deployment](./deployment.md#request-origin-adapter-node-6). Mismatch = SvelteKit CSRF rejection on form actions or cookie domain mismatch → session not attached.

### 2. Inspect cookie in browser devtools

`Application → Cookies`. Look for session cookie:

- `Domain` matches `DOMAIN` env
- `Secure` flag set (production must use HTTPS)
- `HttpOnly` set
- `SameSite` — must be `Lax` or `Strict` for standard flows; `None` requires `Secure`

### 3. Check `+layout.server.ts` (root)

`src/routes/+layout.server.ts` — reads session and forwards user data to all pages. If this throws, all pages break.

### 4. Check `(auth)/+layout.server.ts`

`src/routes/(auth)/+layout.server.ts` — redirects authenticated users away from auth pages. Logic inversion here causes redirect loops.

### 5. Redis connectivity (API-side, not web-side)

`apps/web/.env.schema` has no `REDIS_URL` — the web app never talks to Redis directly. Sessions
are stored and validated by `@adelie/api` (see `apps/api/.env.schema` and
`apps/api/src/lib/server/api/databases/redis/redis.service.ts`); the web app only ever sees the
session cookie and forwards it to the API through the proxy (`src/routes/api/[...slug]/+server.ts`).

If session reads are failing at the storage layer, check Redis from the **API** side, not here:

```bash
# Run against the API's REDIS_URL, from an API host/container — not from web.
redis-cli -u $REDIS_URL ping
# Expect: PONG
```

If that's healthy but sessions still fail from the browser, the problem is almost certainly one of
steps 1-4 above (origin/domain/cookie config), not Redis.

## Common Fixes

| Problem | Fix |
|---|---|
| Form action returns 403 `Cross-site POST form submissions are forbidden` | Origin derived wrong: set `PROTOCOL_HEADER`/`HOST_HEADER` behind a trusted proxy, or build with `WEB_ORIGIN` for plain HTTP |
| `DOMAIN` wrong | Hostname only — no `https://`, no path |
| HTTP in production | Cookies with `Secure` flag dropped over HTTP; enforce HTTPS |
| Redis down (API-side) | Restart Redis; check API's `REDIS_URL` — not a web-app config |
| Stale session after password change | API invalidates old sessions; expected behavior |

## Related

- [Environment Configuration](./environment-config.md)
- [API Connection Issues](./api-connection.md)
