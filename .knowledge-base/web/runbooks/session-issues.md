# Session Issues

Auth uses session cookies set by the API via `Set-Cookie` headers forwarded through the proxy.

## Symptoms

- User logs in but immediately lands back on login page
- Session lost on page reload
- Cookie not sent with requests
- `401` after login succeeds

## Diagnosis

### 1. Check `ORIGIN` and `DOMAIN`

```bash
echo $ORIGIN   # https://secondchancepuzzles.com  (exact match to browser URL)
echo $DOMAIN   # secondchancepuzzles.com           (no protocol, no trailing slash)
```

Mismatch = SvelteKit CSRF rejection or cookie domain mismatch → session not attached.

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

### 5. Redis connectivity

Session data may be stored in Redis. If Redis is down, session reads fail silently or throw.

```bash
redis-cli -u $REDIS_URL ping
# Expect: PONG
```

## Common Fixes

| Problem | Fix |
|---|---|
| `ORIGIN` wrong | Set to exact public URL including protocol, no trailing slash |
| `DOMAIN` wrong | Hostname only — no `https://`, no path |
| HTTP in production | Cookies with `Secure` flag dropped over HTTP; enforce HTTPS |
| Redis down | Restart Redis; check `REDIS_URL` |
| Stale session after password change | API invalidates old sessions; expected behavior |

## Related

- [Environment Configuration](./environment-config.md)
- [API Connection Issues](./api-connection.md)
