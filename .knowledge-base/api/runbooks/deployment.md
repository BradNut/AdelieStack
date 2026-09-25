# API Deployment

## Tools

Coolify + Nixpacks (default) or Docker. Hono/tsx runtime, port 3001. The two deploy paths use
different Node versions and build steps — see below.

## Normal Deploy

Push to `main` → Coolify auto-builds → replaces container on success.

## Nixpacks (`apps/api/nixpacks.toml`)

- Node 22 (`nodejs_22`), apt: `libvips-dev libvips-tools build-essential libpng-dev libjpeg-dev
  zlib1g-dev` (sharp + argon2 native deps)
- Install: `corepack enable && corepack prepare pnpm@10.26.0 --activate`, then
  `pnpm install --frozen-lockfile --filter @adelie/api...`
- Build: `pnpm --filter @adelie/api run paraglide:compile` (compiles Paraglide message modules;
  there is no other build step — the API runs TypeScript directly via `tsx`)
- Start: `pnpm --filter @adelie/api start` → `tsx src/server.ts`

Migrations do **not** run automatically on Nixpacks deploys — see
[Database Migrations](./database-migrations.md#production-migrations).

## Docker (`apps/api/Dockerfile`)

Multi-stage build on `node:24-alpine`:

1. `base` — installs pnpm via corepack (`pnpm@10.26.0`), no source copied (cache-friendly).
2. `manifests` — copies only `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml` and the
   `apps/api` and `packages/shared` package manifests.
3. `build` (from `manifests`) — full `pnpm install --frozen-lockfile --filter @adelie/api...`
   (dev + prod deps), then copies `apps/api/src`, `apps/api/messages`, `apps/api/project.inlang`,
   and `packages/shared/src`, and runs `pnpm --filter @adelie/api run paraglide:compile`.
4. `prod-deps` (from `manifests`, parallel to `build`) —
   `pnpm install --frozen-lockfile --prod --filter @adelie/api...` (production-only deps).
5. `runtime` (fresh `node:24-alpine`) — copies `node_modules` from `prod-deps`, the compiled
   `apps/api/src` (including generated Paraglide output) from `build`, plus
   `apps/api/drizzle`, `apps/api/drizzle.config.ts`, and `apps/api/.env.schema`. Runs as the
   non-root `node` user.

Container start: `CMD ["./node_modules/.bin/tsx", "src/server.ts"]` — this runs the server
directly. **There is no migrate or seed step in the Dockerfile CMD or an entrypoint script.**
If you need migrations to run before the server starts in a Docker deployment, run
`pnpm --filter @adelie/api db:migrate` (and, if needed, `db:seed`) as a separate step —
manually or via a platform pre-deploy hook — before/alongside starting the container. Do not
assume `DB_MIGRATING=true` alone triggers migration inside this image; the schema does declare
`DB_MIGRATING`/`DB_SEEDING` flags (see [Environment Configuration](./environment-config.md)), but
no code path in this image currently reads them to run `db:migrate`/`db:seed` automatically.

**Never hand-edit `drizzle/*.sql` or `drizzle/meta/**`. Use `pnpm db:generate` then `pnpm db:migrate`.**

## Required Env Before Deploy

`ORIGIN`, `DOMAIN`, `DATABASE_*`, `REDIS_URL`, `SIGNING_SECRET`, `STORAGE_*`, `PROJECT_NAME`.

See [Environment Configuration](./environment-config.md) for the full variable list (matches
`apps/api/.env.schema` exactly).

## Post-Deploy Check

```bash
curl -I http://<api-host>:3001/
# Expect 200 or 404 (Hono default)
```

If migrations were expected, check that the separate migrate step (see above) ran and succeeded
before assuming the deploy is healthy — the running container will start even if the schema is
out of date.

## Rollback

Coolify → deployment history → redeploy last successful build.

**Note**: rolled-back app may be behind DB schema. If migration ran destructive changes, restore DB from backup before rollback.

## Related

- [Environment Configuration](./environment-config.md)
- [Build Troubleshooting](./build-troubleshooting.md)
- [Database Migrations](./database-migrations.md)
