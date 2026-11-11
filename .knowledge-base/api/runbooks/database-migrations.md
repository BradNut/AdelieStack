# Database Migrations

**Never hand-write or hand-edit `drizzle/*.sql` or `drizzle/meta/**`. Always use Drizzle tooling.**

## Normal Flow

```bash
# 1. Edit schema in src/lib/server/api/databases/postgres/schema/
# 2. Generate migration SQL
pnpm --filter @adelie/api db:generate

# 3. Review generated SQL in drizzle/
git diff drizzle/

# 4. Apply to local DB
DB_MIGRATING=true pnpm --filter @adelie/api db:migrate
```

## Production Migrations

Migrations do **not** run automatically, in Docker or Nixpacks deployments. Run them manually or via a Coolify pre-deploy hook:

```bash
DB_MIGRATING=true pnpm --filter @adelie/api db:migrate
```

## Commands

| Command | What it does |
|---|---|
| `pnpm db:generate` | Generate migration SQL from schema diff |
| `pnpm db:migrate` | Apply pending migrations to DB (refuses unless `DB_MIGRATING=true`) |
| `pnpm db:push` | Push schema directly to DB (dev only, no migration file) |
| `pnpm db:seed` | Seed initial data (refuses unless `DB_SEEDING=true`) |
| `pnpm db:studio` | Open Drizzle Studio GUI |

## Seeding

```bash
DB_SEEDING=true ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=<pw> pnpm --filter @adelie/api db:seed
```

`ADMIN_PASSWORD` must be at least 15 characters; the password policy rejects a shorter one and the seed fails.

## Troubleshooting

**Migration fails with "column already exists"**: schema and migration files are out of sync. Do not hand-edit to fix — inspect drift with `pnpm db:studio` and re-generate.

**Migration times out**: long-running migration (table lock, large table). Run during low-traffic window or use `LOCK_TIMEOUT` / `STATEMENT_TIMEOUT` at the Postgres level.

**`drizzle/meta/_journal.json` conflict after branch merge**: re-generate migration from merged schema — never manually resolve journal JSON.

## Related

- [Deployment](./deployment.md)
- [Environment Configuration](./environment-config.md)
