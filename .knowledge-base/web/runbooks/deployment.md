# Web Deployment

## Tools

Coolify + Nixpacks (default) or Docker. Node adapter, port 3000.

## Normal Deploy

Push to `main` → Coolify auto-builds → replaces container on success.

## Nixpacks (`apps/web/nixpacks.toml`)

- Node 22, apt: `libvips-dev libvips-tools build-essential libpng-dev libjpeg-dev zlib1g-dev`
  (sharp / `@sveltejs/enhanced-img` build deps)
- Install: `corepack enable && corepack prepare pnpm@10.26.0 --activate`, then
  `pnpm install --frozen-lockfile --filter @adelie/web...`
- Build: `pnpm --filter @adelie/web run build`
- Start: `pnpm --filter @adelie/web start`

PUBLIC_-prefixed vars (e.g. `PUBLIC_IMAGE_URI`, required by `apps/web/.env.schema`) are inlined
into the client bundle at build time via `$env/static/public`, so they must be set as build-time
variables on the platform, not only at runtime.

## Docker (`apps/web/Dockerfile`)

Five stages, `node:24-alpine` throughout: `base` (pnpm via corepack) → `manifests` (copy
package.json/lockfile only, for install caching) → `build` (full install + `pnpm --filter
@adelie/web run build`) → `prod-deps` (production-only install) → `runtime` (prod deps + adapter-node
build output, runs as non-root `node` user).

`PUBLIC_IMAGE_URI` is a required build arg (`--build-arg PUBLIC_IMAGE_URI=...`) since it's inlined
into the client bundle at build time.

### Runtime requires `varlock run`

The runtime image's `CMD` is:

```
["./node_modules/.bin/varlock", "run", "--", "node", "build"]
```

This is not optional. The SSR build's varlock integration validates/resolves the runtime env
against `.env.schema` on boot and expects to be launched through `varlock run` — it injects a
serialized env blob the build reads at startup. Running the build directly with `node build`
(skipping `varlock run`) fails immediately with `initVarlockEnv failed` (verified locally). If you
are deploying via a platform that doesn't honor the Dockerfile `CMD` as-is, you must still invoke
the app through `varlock run -- node build`, not `node build` alone.

## Required Env Before Deploy

`ORIGIN` must match exact production URL. SvelteKit rejects requests from other origins.

See [Environment Configuration](./environment-config.md).

## Post-Deploy Check

```bash
curl -I https://<domain>/
```

Expect `200`. Session cookies set with `Domain=<DOMAIN>` — confirm `DOMAIN` env matches.

## Rollback

Coolify → deployment history → redeploy last successful build.

## Related

- [Environment Configuration](./environment-config.md)
- [Build Troubleshooting](./build-troubleshooting.md)
