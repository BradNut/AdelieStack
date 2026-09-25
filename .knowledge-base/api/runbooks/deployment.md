# API Deployment

## Tools

Coolify + Nixpacks (default) or Docker. Hono/tsx runtime, port 3001.

## Normal Deploy

Push to `main` → Coolify auto-builds → replaces container on success.

## Nixpacks (`apps/api/nixpacks.toml`)

- Node 22, apt: `libvips-dev build-essential` (argon2, pg-native deps)
- Install: `pnpm install --frozen-lockfile`
- Build: skipped — API runs TypeScript via `tsx` at runtime
- Start: `pnpm start` → `tsx src/server.ts`

## Docker (`apps/api/Dockerfile`)

Single stage `node:22-alpine`. On container start:

1. `DB_MIGRATING=true pnpm db:migrate` — runs Drizzle migrations
2. If `DB_SEEDING=true`: `pnpm db:seed`
3. `pnpm start`

**Never hand-edit `drizzle/*.sql` or `drizzle/meta/**`. Use `pnpm db:generate` then `pnpm db:migrate`.**

## Required Env Before Deploy

`ORIGIN`, `DATABASE_*`, `REDIS_URL`, `ENCRYPTION_KEY`, `SIGNING_SECRET`, `MFA_ENCRYPTION_KEY`.

See [Environment Configuration](./environment-config.md).

## Post-Deploy Check

```bash
curl -I http://<api-host>:3001/
# Expect 200 or 404 (Hono default)
```

Check DB migration ran: inspect container startup logs for migration output.

## Rollback

Coolify → deployment history → redeploy last successful build.

**Note**: rolled-back app may be behind DB schema. If migration ran destructive changes, restore DB from backup before rollback.

## Related

- [Environment Configuration](./environment-config.md)
- [Build Troubleshooting](./build-troubleshooting.md)
- [Database Migrations](./database-migrations.md)
