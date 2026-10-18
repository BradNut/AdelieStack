# Web Deployment

## Tools

Coolify + Nixpacks (default) or Docker. Node adapter, port 3000.

## Normal Deploy

Push to `main` → Coolify auto-builds → replaces container on success.

## Nixpacks (`apps/web/nixpacks.toml`)

- Node 24 or newer (enforced by `engines` in `apps/web/package.json`; the Docker image and `nixpacks.toml` use 24), apt: `libvips-dev libvips-tools build-essential libpng-dev libjpeg-dev zlib1g-dev`
  (sharp / `@sveltejs/enhanced-img` build deps)
- Install: `corepack enable && corepack prepare pnpm@10.26.0 --activate`, then
  `pnpm install --frozen-lockfile --filter @adelie/web...`
- Build: `pnpm --filter @adelie/web run build`
- Start: `pnpm --filter @adelie/web start`

PUBLIC_-prefixed vars (e.g. `PUBLIC_IMAGE_URI`, required by `apps/web/.env.schema`) are inlined
into the client bundle at build time via `$app/env/public`, so they must be set as build-time
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

## Request Origin (adapter-node 6)

adapter-node 6 no longer reads the `ORIGIN` env var, so setting it for the web server does nothing. The origin SvelteKit trusts for CSRF checks on form actions and remote functions is now:

- **`WEB_ORIGIN` set at build time** (`paths.origin` in `vite.config.ts`): that exact origin, e.g. `https://example.com`. Pass it as a build arg (`--build-arg WEB_ORIGIN=...`) or a platform build variable. It is baked into the build, so a prebuilt image is pinned to one origin.
- **Otherwise** (the default): derived from each request as `<protocol>://<Host header>`, with protocol `https` unless `PROTOCOL_HEADER` names a header carrying it.

Which to use:

| Deployment | Setup |
|---|---|
| Behind a TLS-terminating proxy that keeps the `Host` header (Coolify/Traefik, most load balancers) | Nothing. The default `https://<host>` is right. |
| Behind a proxy that rewrites `Host` or changes the scheme | Runtime `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host` (add `PORT_HEADER=x-forwarded-port` for a non-standard port). Only behind a trusted proxy: clients can spoof these headers otherwise. |
| Plain HTTP with no proxy (local `node build`, a bare Docker run) | Build with `WEB_ORIGIN=http://localhost:3000` (or your URL). Header variables cannot help: with no proxy nothing sends the protocol. |

Symptom of a wrong origin: `Cross-site POST form submissions are forbidden` (403) on form actions. Plain `fetch` JSON calls such as the Better Auth client are not covered by this check. `e2e/csrf-origin.test.ts` runs the real `node build` server to guard this.

Do not reuse `ORIGIN` for this: the API reads `ORIGIN` for CORS and `.env.schema` gives it a localhost default, which would be baked into the build.

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
