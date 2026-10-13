# AdelieStack

A scalable, testable, extensible starter template: a [Hono](https://hono.dev/) API and a [SvelteKit](https://svelte.dev/docs/kit/introduction) web app in a pnpm + Turbo monorepo, sharing typed contracts.

AdelieStack began as a fork of Rykuno's [TofuStack](https://github.com/Rykuno/TofuStack) and has since diverged: the backend is its own app, auth runs on Better Auth, and the generic (non-domain) layer was re-ported from a production app. Credit to the original for the architecture it grew from.

## ❔ What

SvelteKit is awesome, but sometimes you need more capability in the backend than SvelteKit's own server routes deliver.

To remedy this, the backend is a standalone Hono API (`apps/api`, port `3001` locally) with its own DI container, jobs, storage, and mail. The web app (`apps/web`, port `5173`) forwards everything under `/api/*` to it through a catch-all proxy route, so the browser only ever talks to one origin and cookies stay first-party:

`apps/web/src/routes/api/[...slug]/+server.ts` -> `API_PROXY_BASE_URL` (default `http://127.0.0.1:3001`)

The web app calls the API through a typed Hono RPC client, whose types come from `packages/api-contract`.

## Intention

AdelieStack is the **generic layer** that nearly every application needs, with the domain left out: auth, sessions, roles and permissions, MFA, email, file storage, observability, a UI kit, i18n, and tests. Clone it, delete the example pieces, and build your product on top.

It is deliberately not an "all batteries included" boilerplate. See [How to Use](#how-to-use).

## Repo Layout

- `apps/api` - Hono API (controllers, services, repositories, Drizzle schema, jobs).
- `apps/web` - SvelteKit 2 app (Svelte 5 runes, Tailwind v4, Shadcn/UI).
- `packages/shared` - client-safe constants, domain values, DTOs, validations.
- `packages/api-contract` - Hono RPC types shared by both apps.
- `packages/test-utils` - shared test helpers.
- `docs/adr` - architecture decision records. `.knowledge-base` - API and web docs for contributors and agents.

## Implementation Notes

- **Auth**: Better Auth owns the core (email and password, cookie sessions, two-factor, passkeys, roles `admin` / `support` / `user`), mounted at `/api/auth/*`. Routes declare the permission they need, never a role name ([ADR](./docs/adr/0002-authorization-delegates-to-better-auth.md)).
- **Sign-up is closed by default**; set `SIGN_UP_ENABLED=true` to open it ([ADR](./docs/adr/0002-sign-up-closed-by-default.md)).
- **Captcha** is optional and provider-agnostic, via Better Auth's captcha plugin ([ADR](./docs/adr/0002-captcha-via-better-auth-plugin.md)).
- **Data**: PostgreSQL via Drizzle, Redis for cache and rate limiting. Migrations are generated with Drizzle tooling, never hand-edited.
- **Storage**: S3-compatible SeaweedFS buckets, with uploads scanned by ClamAV.
- **Mail**: `MAILER_TRANSPORT=mailpit` posts to the local Mailpit inbox in development; `unsend` sends for real.
- **Observability**: OpenTelemetry, Sentry, and Spotlight/Jaeger in development.
- **Env**: each app declares its variables in `.env.schema` ([`ENV_SETUP.md`](./ENV_SETUP.md)).
- **Lazy infra**: nothing connects to external services at import time.

## Local Setup

1. Make sure Docker is running
2. Set up your env files — see [`ENV_SETUP.md`](./ENV_SETUP.md) (each app declares its own
   variables in `apps/<app>/.env.schema` with local defaults; you only need to generate the API
   secrets into `apps/api/.env.local`)
3. Ensure that DB_SEEDING and DB_MIGRATING are set to `true` in `apps/api/.env.local` for this first run.
4. `pnpm install`
5. The database extension `citext` is being used to allow for case-insensitive string matching. To install the extension run `CREATE EXTENSION IF NOT EXISTS citext;` or add inside an additional drizzle SQL file for startup to use.
6. `pnpm initialize` (this will start the docker-compose, provision the SeaweedFS storage buckets, and run the initial database migration.) Re-run `pnpm storage:setup` any time to (idempotently) recreate the buckets, e.g. after wiping the `seaweedfs_data` volume.
7. `pnpm dev`
8. Ensure that DB_SEEDING and DB_MIGRATING are set back to `false` (or removed) in `apps/api/.env.local` after initial set up.

No additional setup is required, zero api keys, zero services to signup for, zero cost.

## How to Use

This is **not** supposed to serve as an all batteries included ["production boilerplate"](https://github.com/ixartz/Next-js-Boilerplate) with 200 useless sponsored features that get in your way.
Templates that do this are ANYTHING but "production" and "quick start".

This is stack is designed to be library agnostic. The philosophy here is to boostrap the concrete, repetitive, 
and time-consuming tasks that every application will need regardless of what you're building.

**So - fork this repo, add your favorite libraries, and build out your own "more opinionated" personal template tailored to you**!

## Git Hooks

Plain git hooks in `.githooks/` (no Husky). `pnpm install` runs `prepare`, which sets `core.hooksPath`.

- `pre-commit`: Biome format + lint on staged files, plus the `check:*` guard scripts.
- `commit-msg`: Conventional Commits subject (`feat(web): ...`).
- `pre-push`: `turbo check` (type checks) for web and api.

Skip once with `--no-verify`. CI stays the source of truth.

## Features

- 🟢 Full E2E typesafety
- 🟢 RPC Client for API Requests
- 🟢 Custom Fetch Wrapper
- 🟢 Deployment Template
- 🟢 Authentication (Better Auth)
  - 🟢 Email and Password
  - 🟢 Passkeys
  - 🟢 Two-factor and recovery codes
  - 🟢 Roles and permissions
  - 🟢 Email Update / Verification
  - 🟢 Rate limiter
  - 🔴 OAuth
- 🟢 File storage with virus scanning
- 🟢 Audit log
- 🟢 i18n (Paraglide)
- 🟢 Observability (OpenTelemetry, Sentry)

## Technologies

I'm mostly un-opinionated of what technology or libraries someone uses. Wanna [uwu'ify](https://www.npmjs.com/package/owoifyx) your entire app? Go for it.

That being said, there are some libraries that embody my philosophies of building software more than others,

- [Better Auth](https://www.better-auth.com/): Owns the auth core: email and password, cookie sessions, roles (`admin`, `support`, `user`), two-factor, and passkeys. Its handler is mounted at `/api/auth/*`.
- [Drizzle](https://orm.drizzle.team/) - Drizzle advertises itself as an ORM, but I think its deceptive. It's a query builder with a migration client. Everytime I've used an ORM, I find myself fighting it for sometimes the simplest of use cases. Drizzle just gives you type-safety while querying SQL in a native fashion. Learn SQL, not ORMs.
- [Hono](https://hono.dev/): Fast, lightweight, and built on **web standards**; meaning it can run anywhere you're SvelteKit app can. It's essentially a better, newer, and ironically more stable Express.JS. This provides us a perfect foundation to cleanly build on top of without having to teardown first. It has a zod adapter for validating DTO's which can be shared with the frontend too.
- [SvelteKit](https://svelte.dev/docs/kit/introduction): After trying Vue, React, Next, and pretty much every frontend framework in the JS ecosystem, it's safe to say I vastly prefer Svelte and its priority of building on **web standards**.

## Architecture

There are a few popular architectures for structuring backends. Technical, Onion, DDD, VSA, and the list goes on. I almost always choose
to start with Technical and let the project naturally evolve into one of the others as complexity grows.

### Backend Folder Structure

The API lives in `apps/api/src/lib/server/api/`, grouped by feature (`auth`, `users`, `admin`, `audit`, `mail`, `storage`, `jobs`, `config`) with shared pieces in `common`. Inside a feature, files are named by architectural role:

- **controllers** - Responsible for routing requests.
- **services** - Responsible for handling business logic.
- **repositories** - Responsible for retrieving and storing data.
- **tables** - Drizzle schema definitions.
- **middleware** - Request middleware (session, permissions, rate limiting, logging, locale).
- **dtos** - Shapes of data passed across boundaries, shared with the frontend via `packages/shared`.
- **common** - Anything shared throughout the backend (configs, factories, i18n, utils).

### File Naming

You might notice how each file in the backend is postfixed with its architectural type(e.g. `iam.service.ts`). This allows
us to easily reorganize the folder structure to suite a different architecture pattern if the domain becomes more complex.

For example, if you want to group folders by domain(DDD), you simply drag and drop all related files to that folder.

```
└── events/
    ├── events.controller.ts
    ├── events.service.ts
    └── events.repository.ts
```

## Testing

Testing probably isn't first and foremost when creating an app. That's fine. You should not be spending time writing tests if your app is mutable.

BUT, a good stack should be **testable** when the time to solidify a codebase arrives. Each feature keeps its tests in a sibling `tests/` folder (see `auth/tests/auth.service.test.ts` for a service example).

- `pnpm test` runs API and web unit tests (Vitest).
- `pnpm test:e2e` runs Playwright.
- `pnpm check` type-checks and enforces shared-code boundaries; `pnpm lint` / `pnpm format` run Biome.
