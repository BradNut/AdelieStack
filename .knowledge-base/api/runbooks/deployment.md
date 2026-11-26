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

Multi-stage build on `node:24.22.3-alpine`:

1. `base` — installs pnpm via corepack (`pnpm@10.26.0`), no source copied (cache-friendly).
2. `manifests` — copies only `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml` and the
   `apps/api` and `packages/shared` package manifests.
3. `build` (from `manifests`) — full `pnpm install --frozen-lockfile --filter @adelie/api...`
   (dev + prod deps), then copies `apps/api/src`, `apps/api/messages`, `apps/api/project.inlang`,
   and `packages/shared/src`, and runs `pnpm --filter @adelie/api run paraglide:compile`.
4. `prod-deps` (from `manifests`, parallel to `build`) —
   `pnpm install --frozen-lockfile --prod --filter @adelie/api...` (production-only deps).
5. `runtime` (fresh `node:24.22.3-alpine`) — copies `node_modules` from `prod-deps`, the compiled
   `apps/api/src` (including generated Paraglide output) from `build`, plus
   `apps/api/drizzle`, `apps/api/drizzle.config.ts`, and `apps/api/.env.schema`. Runs as the
   non-root `node` user.

Container start: `CMD ["./node_modules/.bin/tsx", "src/server.ts"]` — this runs the server
directly. **There is no migrate or seed step in the Dockerfile CMD or an entrypoint script.**
If you need migrations to run before the server starts in a Docker deployment, run
`DB_MIGRATING=true pnpm --filter @adelie/api db:migrate` (and, if needed, `DB_SEEDING=true ... db:seed`)
as a separate step — manually or via a platform pre-deploy hook — before/alongside starting the
container. Do not assume `DB_MIGRATING=true` alone triggers migration inside this image: the
`DB_MIGRATING`/`DB_SEEDING` flags only permit those scripts to run (see
[Environment Configuration](./environment-config.md)), and the running API ignores them.

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
Set `DATABASE_SSL_MODE=verify-full` unless Postgres shares the host or a private network with the API
(see [Database TLS](./environment-config.md#database-tls)); the default `disable` sends queries in the clear.
With `TRUST_PROXY=true`, keep the API port reachable only from the trusted proxy (see [Network Boundary](#network-boundary)).
Keep Redis on the API's private network and use `rediss://` or a password in `REDIS_URL` when anything else shares
it or it is reached over a network (see [Redis access and TLS](./environment-config.md#redis-access-and-tls)).

See [Environment Configuration](./environment-config.md) for the full variable list (matches
`apps/api/.env.schema` exactly).

## Network Boundary

With `TRUST_PROXY=true`, the API port (3001) must accept connections **only from the trusted proxy**. The API
believes `X-Forwarded-For` and `X-Forwarded-Proto` from whoever connects; it does not check who that is. A client
that reaches the port directly can write any address into `X-Forwarded-For` and get a fresh rate-limit bucket on
every request, which defeats auth rate limiting (sign-in, two-factor codes, password reset) and the `rateLimit()`
middleware. `TRUSTED_PROXIES` does not prevent this: it decides which addresses in a forwarded chain are trusted,
and a client that connects directly writes the whole chain. So the network in front of the API is the protection,
and keeping it is the deployer's job.

### Supported layouts

- **The web app's `/api` proxy** (the default): the web app is the API's only client. Point `API_PROXY_BASE_URL`
  at the API's private address, such as `http://api:3001`, never at a public URL. The web tier overwrites
  `X-Forwarded-For` (see [Auth rate limiting](./environment-config.md#auth-rate-limiting)).
- **A reverse proxy in front of the API** (Traefik, nginx, a load balancer): the proxy is the only public way in,
  and it talks to the API over the private network. If it appends to `X-Forwarded-For`, declare it in
  `TRUSTED_PROXIES`.

Both layouts can run together; each proxy must reach the API over the private network. The storage provider
calls the webhook on the API directly (see the [web API connection runbook](../../web/runbooks/api-connection.md)),
so it must be on that private network too.

### Coolify

- **No published port**: leave **Ports Mappings** empty on the API. **Ports Exposes** (`3001`) only tells
  Coolify's proxy where to route and publishes nothing on the host.
- **Domains**: with the web app's `/api` proxy, give the API **no domain**. With a reverse proxy in front of the
  API, the only domain is the one that proxy serves. A domain on the API itself makes Coolify's Traefik that
  proxy; Traefik appends to `X-Forwarded-For`, so declare its address on the private network in `TRUSTED_PROXIES`.
- **Private network**: put the web app (or the proxy) and the API in the same Coolify project and destination so
  they share its Docker network, and reach the API by its service name. Resources in separate projects need
  **Connect To Predefined Network** to share one.

### Docker

- **No published port**: run the API without `-p` / `ports:`. Docker's published ports bypass host firewalls
  such as `ufw`, so a firewall rule does not make up for one. If a proxy on the host itself must reach the
  container, publish it on loopback only: `-p 127.0.0.1:3001:3001`.
- **Private network**: create a user-defined network (`docker network create adelie-internal`), attach the API
  and the web app or proxy to it (`--network adelie-internal`), and set `API_PROXY_BASE_URL=http://<api-container-name>:3001`.
- Outside a container (a bare `tsx src/server.ts`), the API listens on `HOST`, `0.0.0.0` by default. With the
  proxy on the same host, set `HOST=127.0.0.1`.

### Check the boundary

From a machine **outside** the private network, the API port must not answer, on every public address of the
host (IPv4 and IPv6):

```bash
curl -sS --max-time 5 http://<public-ip>:3001/api/healthz
curl -sS --max-time 5 'http://[<public-ipv6>]:3001/api/healthz'
# Expect a refused connection or a timeout, never an HTTP response
```

With the web app's `/api` proxy, also check that no API domain answers: `curl -sS --max-time 5 https://<api-domain>/api/healthz`
should fail to resolve or connect. From **inside** (the web container, or the proxy), the same request must work:

```bash
curl -sS http://api:3001/api/healthz
# Expect 200
```

Repeat the outside check after changing ports, domains or networks.

## Post-Deploy Check

Run from inside the private network (see [Network Boundary](#network-boundary)):

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
