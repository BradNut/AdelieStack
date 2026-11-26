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
With `TRUST_PROXY=true`, keep the API port reachable only from the trusted proxy
(see [Network Boundary](#network-boundary)).
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

- **The web app's `/api` proxy** (the default): the web app is the API's only client, and the API has no public
  domain. Point `API_PROXY_BASE_URL` at the API's private address, such as `http://api:3001`, never at a public
  URL. The web tier overwrites `X-Forwarded-For`
  (see [Auth rate limiting](./environment-config.md#auth-rate-limiting)).
- **A reverse proxy in front of the API** (Traefik, nginx, a load balancer): the proxy is the only public way in,
  its domain is the API's only public domain, and it talks to the API over the private network. If it appends to
  `X-Forwarded-For`, declare it in `TRUSTED_PROXIES`; when its address can change (a container), declare the
  private network's subnet as a CIDR range. The web proxy refuses `/api/storage/webhook` so that provider-only
  route stays private; this proxy does not, so block that path on it.

Both layouts can run together; each proxy must reach the API over the private network. The storage provider
calls the webhook on the API directly (see the [web API connection runbook](../../web/runbooks/api-connection.md)),
so it must be on that private network too.

### Coolify

The same rules apply whichever build pack builds the API: Nixpacks, Railpack or Dockerfile.

- **No published port**: leave **Ports Mappings** empty on the API. A mapping publishes the port on the server
  for anyone who can reach it, bypassing the proxy. **Ports Exposes** (`3001`) only tells Coolify's proxy where
  to route and publishes nothing.
- **Domains**: with the web app's `/api` proxy, give the API **no domain**. A domain on the API makes Coolify's
  Traefik the reverse proxy of the second layout, with everything that layout needs: Traefik appends to
  `X-Forwarded-For`, and its container address is not stable.
- **Private network, Applications** (Nixpacks, Railpack, Dockerfile): Coolify attaches them to their
  destination's Docker network (the default is `coolify`), whatever project they are in. Put the web app and the
  API on the same destination. The API's generated container name changes on every deploy, so give it a
  **Network Alias** (such as `api.internal`) and set `API_PROXY_BASE_URL=http://api.internal:3001`.
- **Private network, Docker Compose**: a Compose resource gets its own network and does not join the destination's.
  Services in one stack reach each other by service name. To reach an Application or another stack, enable
  **Connect to predefined network**. Service names can then be prefixed and are shared with preview deployments,
  so check the resolved name, or use the `SERVICE_NAME_*` variable for the service. Do not give the API `ports:`.
- **Who else can connect**: every resource on that network, Coolify's Traefik included, can reach port 3001.
  Deploy workloads you do not trust to another destination.

Sources: Coolify's [networking](https://coolify.io/docs/core/networking-in-coolify),
[application network settings](https://coolify.io/docs/applications/configuration/general),
[Docker Compose](https://coolify.io/docs/applications/builds/docker-compose) and
[firewall](https://coolify.io/docs/core/infrastructure/servers/firewall) docs.

### Docker

- **No published port**: run the API without `-p` / `ports:`. Docker's published ports bypass host firewalls
  such as `ufw`, so a firewall rule does not make up for one. If a proxy on the host itself must reach the
  container, publish it on loopback only: `-p 127.0.0.1:3001:3001`.
- **Private network**: create a user-defined network (`docker network create <network>`), attach the API and the
  web app or proxy to it (`--network <network>`), and set
  `API_PROXY_BASE_URL=http://<api-container-name>:3001`.
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

Then check the domains. With the web app's `/api` proxy, no domain other than the web app's may reach the API;
with a reverse proxy, only that proxy's domain may, and the webhook must be blocked on it:

```bash
curl -sS --max-time 5 https://<other-domain>/api/healthz
# Web /api proxy layout, any domain pointing at the host other than the web app's:
# expect a failure or the proxy's own 404, never the API's {"status":"ok"}
curl -sS --max-time 5 -o /dev/null -w '%{http_code}\n' -X POST https://<proxy-domain>/api/storage/webhook
# Reverse proxy layout: expect the status your block returns (such as 403 or 404), never one from the API
```

From **inside** the private network (the web container, or the proxy), the API must answer:

```bash
curl -sS http://<api-host>:3001/api/healthz
# Expect 200
```

Repeat the outside checks after changing ports, domains or networks.

## Post-Deploy Check

Run from inside the private network (see [Network Boundary](#network-boundary)):

```bash
curl -I http://<api-host>:3001/api/healthz
# Expect 200
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
