# Web Deployment

## Tools

Coolify + Nixpacks (default) or Docker. Node adapter, port 3000.

## Normal Deploy

Push to `main` → Coolify auto-builds → replaces container on success.

## Nixpacks (`apps/web/nixpacks.toml`)

- Node 22, apt: `libvips-dev build-essential` (sharp deps)
- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm turbo run build --filter=@secondchance/web`
- Start: `pnpm --filter @secondchance/web start`

## Docker (`apps/web/Dockerfile`)

Two-stage: `node:22-alpine` builder → runner. Uses `build:low-mem` (VIPS concurrency capped — prevents OOM).

```bash
pnpm --filter @secondchance/web build:low-mem
```

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
