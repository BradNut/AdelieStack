# Web Build Troubleshooting

## Common Failures

### OOM / killed during build

`sharp` compiles native binaries; memory spikes during Vite SSR bundling.

Fix: use `build:low-mem` instead of `build`:

```bash
pnpm --filter @adelie/web build:low-mem
# Sets VIPS_CONCURRENCY=1 UV_THREADPOOL_SIZE=2
```

The real `apps/web/Dockerfile` does **not** use `build:low-mem` — its `build` stage runs plain
`pnpm --filter @adelie/web run build`. Nixpacks also uses plain `build`. If either build OOMs,
switch the build command to `build:low-mem` (Dockerfile or Nixpacks build phase) or add resource
limits in Coolify.

### Native dep compile error (`sharp`, `libvips`)

Nixpacks apt deps: `libvips-dev libvips-tools build-essential libpng-dev libjpeg-dev zlib1g-dev`

If Docker build fails on `sharp`:

```bash
# Verify base image has libs
docker run --rm node:24-alpine apk add vips-dev build-base
```

### TypeScript / svelte-check errors

```bash
pnpm --filter @adelie/web check
```

Fails = type errors or boundary violations. Fix root cause — do not add `@ts-ignore`.

### Broken imports / missing workspace package

```bash
pnpm install --frozen-lockfile
pnpm --filter @adelie/web sync  # svelte-kit sync regenerates $types
```

### Paraglide / i18n compile error

Messages in `apps/web/messages/`. Invalid message key or missing locale file causes build failure.

```bash
ls apps/web/messages/
# Ensure all locales referenced in project.inlang/ exist
```

### Turbo cache stale

```bash
pnpm turbo run build --filter=@adelie/web --force
```

## Local Build Verify

```bash
pnpm --filter @adelie/web build
pnpm --filter @adelie/web start
curl -I http://localhost:3000/
```

**This will fail as written.** `start` runs `node build` directly (see `apps/web/package.json`),
with no varlock wrapper. The production build's SSR entry requires varlock to inject the resolved
env at boot; running it without `varlock run` fails immediately with `initVarlockEnv failed`
(verified locally — this is the same requirement documented in
[Deployment](./deployment.md#docker-appswebdockerfile) for the Docker image's `CMD`). To actually
verify a local production build, run it through varlock instead:

```bash
pnpm --filter @adelie/web build
cd apps/web && ./node_modules/.bin/varlock run -- node build
curl -I http://localhost:3000/   # or the PORT/HOST from your .env
```

Fixing `start` to invoke `varlock run` for you (instead of documenting the workaround) would be a
worthwhile follow-up in `apps/web/package.json`.

## Related

- [Deployment](./deployment.md)
- [Environment Configuration](./environment-config.md)
