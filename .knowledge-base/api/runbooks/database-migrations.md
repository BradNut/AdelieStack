# Database Migrations

**Never hand-write or hand-edit `drizzle/*.sql` or `drizzle/meta/**`. Always use Drizzle tooling.**

## Normal Flow

```bash
# 1. Edit schema in src/lib/server/api/databases/postgres/schema/
# 2. Generate migration SQL
pnpm --filter @secondchance/api db:generate

# 3. Review generated SQL in drizzle/
git diff drizzle/

# 4. Apply to local DB
pnpm --filter @secondchance/api db:migrate
```

## Production Migrations

Docker startup runs `DB_MIGRATING=true pnpm db:migrate` automatically before starting the server.

Nixpacks deployment: migrations do **not** run automatically. Must run manually or via Coolify pre-deploy hook:

```bash
pnpm --filter @secondchance/api db:migrate
```

## Commands

| Command | What it does |
|---|---|
| `pnpm db:generate` | Generate migration SQL from schema diff |
| `pnpm db:migrate` | Apply pending migrations to DB |
| `pnpm db:push` | Push schema directly to DB (dev only, no migration file) |
| `pnpm db:seed` | Seed initial data (requires `DB_SEEDING=true` or explicit run) |
| `pnpm db:studio` | Open Drizzle Studio GUI |

## Seeding

```bash
DB_SEEDING=true ADMIN_USERNAME=admin ADMIN_PASSWORD=<pw> pnpm --filter @secondchance/api db:seed
```

Or set `DB_SEEDING=true` in env and restart Docker container (seed runs after migrate).

## Troubleshooting

**Migration fails with "column already exists"**: schema and migration files are out of sync. Do not hand-edit to fix — inspect drift with `pnpm db:studio` and re-generate.

**Migration times out**: long-running migration (table lock, large table). Run during low-traffic window or use `LOCK_TIMEOUT` / `STATEMENT_TIMEOUT` at the Postgres level.

**`drizzle/meta/_journal.json` conflict after branch merge**: re-generate migration from merged schema — never manually resolve journal JSON.

## Related

- [Deployment](./deployment.md)
- [Environment Configuration](./environment-config.md)
