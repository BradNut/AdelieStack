# API Connection Issues

Web proxies all API calls through `src/routes/api/[...slug]/+server.ts` → `API_PROXY_BASE_URL`.

## Symptoms

- 502 / 504 on any `/api/*` route
- Auth endpoints return errors in web but API is up
- Webhook calls fail (`/api/[...slug]`)

## Diagnosis

### 1. Check env var

```bash
echo $API_PROXY_BASE_URL
# Should be internal URL: http://api:3001 (prod) or http://127.0.0.1:3001 (dev)
```

### 2. Reachability from web container

```bash
curl -I $API_PROXY_BASE_URL/health
# Expect 200
```

If timeout: network/DNS issue between containers. Check Coolify service networking.

### 3. Check proxy handler

`src/routes/api/[...slug]/+server.ts` — forwards all methods. Inspect for recent changes.

### 4. WebAuthn / passkey endpoint

`src/routes/api/webauthn/` has its own handlers. These call the API directly via `API_PROXY_BASE_URL`. Same network check applies.

### 5. Check-password endpoint

`src/routes/api/check-password/` — separate route, not proxied through `[...slug]`. Inspect `+server.ts` for its target URL.

## Common Fixes

| Problem | Fix |
|---|---|
| Wrong `API_PROXY_BASE_URL` | Update in Coolify env → redeploy |
| API container not started | Start API service first |
| Container network mismatch | Put both services on same Coolify network |
| CORS error on preflight | Only matters for direct browser → API calls; proxy routes bypass CORS |

## Related

- [Environment Configuration](./environment-config.md)
- [Session Issues](./session-issues.md)
