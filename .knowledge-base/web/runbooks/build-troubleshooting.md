# Web Build Troubleshooting

## Common Failures

### OOM / killed during build

`sharp` compiles native binaries; memory spikes during Vite SSR bundling.

Fix: use `build:low-mem` instead of `build`:

```bash
pnpm --filter @secondchance/web build:low-mem
# Sets VIPS_CONCURRENCY=1 UV_THREADPOOL_SIZE=2
```

Docker already uses `build:low-mem`. Nixpacks uses plain `build` — if OOM, add resource limits in Coolify or switch to Docker build method.

### Native dep compile error (`sharp`, `libvips`)

Nixpacks apt deps: `libvips-dev libvips-tools build-essential libpng-dev libjpeg-dev zlib1g-dev`

If Docker build fails on `sharp`:

```bash
# Verify base image has libs
docker run --rm node:22-alpine apk add vips-dev build-base
```

### TypeScript / svelte-check errors

```bash
pnpm --filter @secondchance/web check
```

Fails = type errors or boundary violations. Fix root cause — do not add `@ts-ignore`.

### Broken imports / missing workspace package

```bash
pnpm install --frozen-lockfile
pnpm --filter @secondchance/web sync  # svelte-kit sync regenerates $types
```

### Paraglide / i18n compile error

Messages in `apps/web/messages/`. Invalid message key or missing locale file causes build failure.

```bash
ls apps/web/messages/
# Ensure all locales referenced in project.inlang/ exist
```

### Turbo cache stale

```bash
pnpm turbo run build --filter=@secondchance/web --force
```

## Local Build Verify

```bash
pnpm --filter @secondchance/web build
pnpm --filter @secondchance/web start
curl -I http://localhost:3000/
```

## Related

- [Deployment](./deployment.md)
- [Environment Configuration](./environment-config.md)
