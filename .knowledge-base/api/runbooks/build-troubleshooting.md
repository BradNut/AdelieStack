# API Build Troubleshooting

## No Build Step (beyond Paraglide)

API has no TypeScript compile step. Runs TypeScript directly via `tsx src/server.ts`. The one
build phase that does exist (Nixpacks `[phases.build]`, Dockerfile `build` stage) only runs
`pnpm --filter @adelie/api run paraglide:compile` to generate the Paraglide message modules under
`apps/api/src/lib/paraglide`.

Errors at startup are runtime errors, not build errors.

## Startup Failures

### Missing env var

`ConfigService` (`apps/api/src/lib/server/api/common/configs/config.service.ts`) validates
`process.env` against the Zod schema in `apps/api/src/lib/server/api/common/configs/dtos/env.dto.ts`
on construction. If a required env var is missing, it throws `Failed to parse environment
variables` / `Missing environment variables: ...` naming the field(s), and the process exits.

Fix: set the missing var in Coolify env (or local `.env`) → redeploy/restart. The full required
var list is `apps/api/.env.schema` — see [Environment Configuration](./environment-config.md).

### Native dep compile error (`argon2`, `sharp`)

Nixpacks apt deps: `libvips-dev libvips-tools build-essential libpng-dev libjpeg-dev zlib1g-dev`
(matches `apps/api/nixpacks.toml`).

If install fails on `argon2`:

```bash
# Verify gcc available in image
docker run --rm node:24-alpine apk add build-base python3
```

### Import-time infrastructure connection

**Rule**: DB, Redis, storage, email, scanners must initialize lazily — never at import time.

If you see Redis/Postgres connection errors during startup before any request:

1. Find the service that connects at import time.
2. Move connection to a lazy getter or factory pattern.
3. Do not silence the error.

See `apps/api/src/lib/server/api/databases/redis/redis.service.ts` for the Redis lazy init
pattern — `RedisService.redis` only constructs the `ioredis` client (with `lazyConnect: true`) on
first access, not at import time.

### Port conflict

```bash
lsof -i :3001
# Kill or change PORT env
```

### `tsx` not found

```bash
pnpm --filter @adelie/api install
```

## Local Startup Verify

```bash
pnpm --filter @adelie/api dev
curl -I http://localhost:3001/
```

## Related

- [Deployment](./deployment.md)
- [Environment Configuration](./environment-config.md)
