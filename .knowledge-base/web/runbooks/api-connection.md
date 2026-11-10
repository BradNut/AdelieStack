# API Connection Issues

Web proxies all API calls through `src/routes/api/[...slug]/+server.ts` → `API_PROXY_BASE_URL`.

## Symptoms

- 502 / 504 on any `/api/*` route
- Auth endpoints return errors in web but API is up
- Storage webhook calls get 404 through the web app: expected. The proxy refuses `STORAGE_WEBHOOK_PATH`
  (`/api/storage/webhook`, `@adelie/shared`) so the provider-only route is not public; point the storage
  provider at the API directly (`http://api:3001/api/storage/webhook` on the internal network)

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

`src/routes/api/[...slug]/+server.ts` — forwards all methods. Inspect for recent changes. This is
the **only** route under `apps/web/src/routes/api/` (plus its `tests/` folder) — there are no
separate per-feature proxy routes (e.g. no webauthn or check-password handlers); every `/api/*`
request goes through this single catch-all. The one exception is the storage webhook, which it answers
with 404 without calling the API (any spelling of the path: case, percent-encoding, extra or trailing
slashes, dot segments).

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
