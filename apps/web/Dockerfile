# syntax=docker/dockerfile:1

# Shared base: pnpm via corepack. No source is copied here so this layer
# stays cached across dependency and app-source changes.
FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.0 --activate

# Manifests only, so `pnpm install` layers are cached until a package.json or
# the lockfile changes.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api-contract/package.json packages/api-contract/package.json

# Full install (dev + prod) to run the SvelteKit/Vite production build.
FROM manifests AS build
RUN pnpm install --frozen-lockfile --filter @adelie/web...
COPY apps/web apps/web
COPY packages/shared/src packages/shared/src
COPY packages/api-contract/src packages/api-contract/src

# PUBLIC_-prefixed vars are inlined into the client bundle at build time via
# SvelteKit's `$env/static/public`, so they must be supplied as build args
# (never real secrets: this schema only exposes non-sensitive PUBLIC_ values).
# PUBLIC_IMAGE_URI is required by apps/web/.env.schema; override it with
# `--build-arg PUBLIC_IMAGE_URI=...` to point at a real deployment's public
# object storage origin.
ARG PUBLIC_IMAGE_URI=http://localhost:8333/adelie-public-development
ENV PUBLIC_IMAGE_URI=${PUBLIC_IMAGE_URI}
ENV ENVIRONMENT=production
RUN pnpm --filter @adelie/web run build

# Production-only dependency graph for the web app and its workspace
# dependencies. `--filter @adelie/web...` limits resolution to @adelie/web
# plus the workspace packages it depends on (skips apps/api entirely).
FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @adelie/web...

# Runtime image: production dependencies plus the adapter-node build output.
# No devDependencies, no Svelte/TypeScript source, no tests, no Storybook.
# `node build` is invoked directly (not via `pnpm start`) so the runtime
# container never needs corepack/pnpm or network access to start.
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps /app/packages/api-contract/node_modules ./packages/api-contract/node_modules

COPY packages/shared/package.json packages/shared/package.json
COPY packages/shared/src packages/shared/src
COPY packages/api-contract/package.json packages/api-contract/package.json
COPY packages/api-contract/src packages/api-contract/src

COPY apps/web/package.json apps/web/package.json
COPY apps/web/.env.schema apps/web/.env.schema
COPY --from=build /app/apps/web/build apps/web/build

RUN chown -R node:node /app
USER node

WORKDIR /app/apps/web
EXPOSE 3000
# The SSR build's varlock integration validates/resolves the runtime env
# against .env.schema on boot and expects to be launched through `varlock
# run` (it injects a serialized env blob into __VARLOCK_ENV); running it
# directly with `node build` fails with "initVarlockEnv failed". The
# `varlock` binary is invoked directly (not via `pnpm`) so the container
# never needs corepack/pnpm or network access to start.
CMD ["./node_modules/.bin/varlock", "run", "--", "node", "build"]
