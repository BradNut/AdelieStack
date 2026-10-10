# Sveltekit - Adelie Stack

This stack is a cloned and modified version of GitHub user [Rykuno](https://github.com/rykuno)'s [TofeStack](https://github.com/Rykuno/TofuStack).

## ❔ What

A scalable, testable, extensible, template for Sveltekit.

Sveltekit is awesome, but sometimes you need a bit more capability in the backend than what frameworks like
NextJS & Sveltekit can deliver.

To remedy this, I've attached a fully fleshed out backend to run on the Sveltekit process and forward all API requests 
to it and paired it with some architectural patterns.

`/api/[...slugs]`

```ts
import app from '$lib/api';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = ({ request }) => app.fetch(request);
export const PUT: RequestHandler = ({ request }) => app.fetch(request);
export const DELETE: RequestHandler = ({ request }) => app.fetch(request);
export const POST: RequestHandler = ({ request }) => app.fetch(request);
export const fallback: RequestHandler = ({ request }) => app.fetch(request);
```

## Local Setup

1. Make sure Docker is running
2. Set up your env files — see [`ENV_SETUP.md`](./ENV_SETUP.md) (each app declares its own
   variables in `apps/<app>/.env.schema`; copy it to `apps/<app>/.env` and fill in real values)
3. Ensure that DB_SEEDING and DB_MIGRATING are set to `true` in the `.env` for this first run.
4. `pnpm install`
5. The database extension `citext` is being used to allow for case-insensitive string matching. To install the extension run `CREATE EXTENSION IF NOT EXISTS citext;` or add inside an additional drizzle SQL file for startup to use.
6. `pnpm initialize` (this will start the docker-compose, provision the SeaweedFS storage buckets, and run the initial database migration.) Re-run `pnpm storage:setup` any time to (idempotently) recreate the buckets, e.g. after wiping the `seaweedfs_data` volume.
7. `pnpm dev`
8. Ensure that DB_SEEDING and DB_MIGRATING are set back to `false` in the `.env` after initial set up.

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
- 🟠 Authentication
  - 🟢 Email / Passkey
  - 🟢 Email and Password
  - 🔴 OAuth
  - 🟢 Email Update / Verification
  - 🟢 Rate limiter

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

- **controllers** - Responsible for routing requests

- **services** - Responsible for handling business logic.

- **repositories** - Responsible for retrieving and
  storing data.

- **infrastructure** - Handles the implementation of external services or backend operations.

- **middleware** - Middlware our request router is responsible for handling.

- **providers** - Injectable services

- **dtos** - Data Transfer Objects (DTOs) are used to define the shape of data that is passed.

- **common** - Anything commonly shared throughout the backend

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

BUT, a good stack should be **testable** when the time to solidify a codebase arrives. I created this stack with that principle in mind. I've provided a examples of how to write these tests under `authentication.service.test.ts` or `users.service.test.ts`
