# Environment Variables Setup

This monorepo uses [varlock](https://varlock.dev) for environment configuration. Each app
declares every variable it consumes once, in `apps/<app>/.env.schema`, with a type,
required-ness, and a description. Varlock validates the resolved environment against that
schema at startup (API) and at dev/build time (web), so a missing or malformed required
variable fails fast with a message naming it, instead of surfacing later as `undefined` deep
inside a service.

## Files, per app

- `apps/<app>/.env.schema` — tracked in git. The single source of truth for that app's env
  vars. Contains only placeholder/example values, never real secrets.
- `apps/<app>/.env` — gitignored. Your local values.
- `apps/<app>/.env.local` — gitignored, highest precedence. Personal overrides that should
  never be shared (e.g. a locally generated secret), layered on top of `.env`.
- `apps/<app>/env.d.ts` — gitignored, generated. Provides `NodeJS.ProcessEnv` / `import.meta.env`
  types for the app. Regenerated automatically whenever you run `dev`, `build`, `start`, or
  `preview` for that app (varlock's Vite plugin / `varlock/auto-load` runs codegen as a
  side effect). To regenerate it on demand without starting the app, run
  `pnpm --filter @adelie/api exec varlock codegen` (swap the filter for `@adelie/web`).

## Quick start

```bash
# Copy each app's schema to a local .env and fill in real values.
cp apps/api/.env.schema apps/api/.env
cp apps/web/.env.schema apps/web/.env

# Generate required security keys for the API (apps/api/.env)
echo "SIGNING_SECRET=$(openssl rand -hex 32)" >> apps/api/.env

# Start infrastructure (Postgres, Redis, SeaweedFS, Mailpit, ...)
docker compose up -d
pnpm storage:setup

# Initialize the database
pnpm db:migrate
pnpm db:seed

# Start both apps
pnpm dev
```

## Shared variables

A few variables are declared in both `apps/api/.env.schema` and `apps/web/.env.schema` and
should be kept consistent across the two apps' local env files when applicable:

- `ENVIRONMENT`
- `PUBLIC_IMAGE_URI` (must match the API's SeaweedFS public bucket URL)

## Secrets and the client bundle

Only variables prefixed `PUBLIC_` are safe to reach the browser bundle; varlock infers them as
non-sensitive by prefix (`@defaultSensitive=inferFromPrefix('PUBLIC_')` in each schema) and the
web app only ever reads them through SvelteKit's `$env/static/public` /
`$env/dynamic/public`. Everything else — API keys, signing secrets, storage credentials — stays
server-only and is read through `$env/dynamic/private` (web) or `process.env` /
`ConfigService` (API), never imported into client-bundled code.

## Using a password manager

Secrets can come from a password manager instead of a local `.env`. Varlock has plugins for Proton Pass,
1Password, Bitwarden and others (see <https://varlock.dev/plugins>). With Proton Pass, install
`@varlock/proton-pass-plugin`, add `@plugin(@varlock/proton-pass-plugin)` and `@initProtonPass(id=prod)` to the
schema header, and set a variable to `protonPass(prod, pass://<vault>/<item>/<field>)`. This repo does not require
one: the schema defaults are plain so a fresh clone works. Never commit real `.env*` files; the pre-commit and
pre-push hooks refuse them.

## Adding a new variable

1. Add it to the relevant app's `apps/<app>/.env.schema` with `@type`, `@sensitive` (defaults
   to non-sensitive unless prefixed `PUBLIC_`), and a description/comment.
2. Add a placeholder to your local `.env` (or `.env.local`) if you need a real value to develop
   against.
3. If the API's `ConfigService` needs to read it, add it to
   `apps/api/src/lib/server/api/common/configs/dtos/env.dto.ts` too, so the Zod DTO the service
   layer depends on stays in sync with the schema.

## Production deployment

1. Never commit `.env` or `.env.local` files.
2. Use your deployment platform's environment variable management to supply real values for
   every required variable declared in `.env.schema`.
3. Generate strong, unique values for all security-related variables (`SIGNING_SECRET`, storage
   credentials, etc).

## Reference

- API environment schema: `apps/api/.env.schema`
- Web environment schema: `apps/web/.env.schema`
- `varlock` docs: <https://varlock.dev/env-spec>
