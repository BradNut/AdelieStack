# API Deployment

## Tools

Coolify + Nixpacks (default) or Docker. Hono/tsx runtime, port 3001. The two deploy paths use
different Node versions and build steps — see below.

## Normal Deploy

Push to `main` → Coolify auto-builds → replaces container on success.

## Nixpacks (`apps/api/nixpacks.toml`)

- Node 24 (`nodejs_24`), apt: `libvips-dev libvips-tools build-essential libpng-dev libjpeg-dev
  zlib1g-dev` (sharp + argon2 native deps)
- Install: `corepack enable && corepack prepare pnpm@10.26.0 --activate`, then
  `pnpm install --frozen-lockfile --filter @adelie/api...`
- Build: `pnpm --filter @adelie/api run paraglide:compile` (compiles Paraglide message modules;
  there is no other build step — the API runs TypeScript directly via `tsx`)
- Start: `cd apps/api && exec ./node_modules/.bin/tsx src/server.ts`. Do not start it through
  `pnpm`: pnpm does not pass SIGTERM on, so the graceful shutdown never runs. If the platform's
  Start Command setting (Coolify, for example) overrides `nixpacks.toml`, it needs the same command.

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

## Startup and Shutdown

`src/server.ts` runs startup, then starts listening, so a failed startup means the server never serves.

Startup fails the boot when:

- Any storage request errors. Missing buckets are created; a bucket another instance created at the
  same moment is fine.
- `JOBS_ENABLED` is true and Redis has not answered within 10s.

On SIGINT or SIGTERM the API logs `Shutting down...`, closes HTTP, closes jobs, flushes telemetry and
exits. The sequence has 8s overall. A step that errors is logged and later steps still run. The exit
code is 0 when every step succeeded and 1 if any step failed or the limit was reached; at the limit the
log names what was unfinished.

## Audit Log Retention

With `JOBS_ENABLED` true (the default), a job runs weekly (Sunday 00:00) and **permanently deletes
audit rows older than 90 days**. Each run logs how many rows it deleted. Export audit rows first if you
must keep them longer. An interrupted run is safe: the delete either completes or BullMQ reruns the job.

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
