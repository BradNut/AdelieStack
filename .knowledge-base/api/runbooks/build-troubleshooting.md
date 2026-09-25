# API Build Troubleshooting

## No Build Step

API has no compile step. Runs TypeScript directly via `tsx src/server.ts`. Nixpacks build phase is a no-op.

Errors at startup are runtime errors, not build errors.

## Startup Failures

### Missing env var

API calls `src/lib/server/api/config/env.ts` (or similar) on startup. If required env var missing, process exits with error message naming the variable.

Fix: set missing var in Coolify env → redeploy.

### Native dep compile error (`argon2`, `sharp`)

Nixpacks apt deps: `libvips-dev build-essential` (matches `apps/api/nixpacks.toml`).

If install fails on `argon2`:

```bash
# Verify gcc available in image
docker run --rm node:22-alpine apk add build-base python3
```

### Import-time infrastructure connection

**Rule**: DB, Redis, storage, email, scanners must initialize lazily — never at import time.

If you see Redis/Postgres connection errors during startup before any request:

1. Find the service that connects at import time.
2. Move connection to a lazy getter or factory pattern.
3. Do not silence the error.

See `apps/api/src/lib/server/api/services/` for Redis lazy init pattern.

### Port conflict

```bash
lsof -i :3001
# Kill or change PORT env
```

### `tsx` not found

```bash
pnpm --filter @secondchance/api install
```

## Local Startup Verify

```bash
pnpm --filter @secondchance/api dev
curl -I http://localhost:3001/
```

## Related

- [Deployment](./deployment.md)
- [Environment Configuration](./environment-config.md)
