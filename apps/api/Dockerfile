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
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

# Full install (dev + prod) to compile the Paraglide message modules the API
# imports at runtime.
FROM manifests AS build
RUN pnpm install --frozen-lockfile --filter @adelie/api...
COPY apps/api/project.inlang apps/api/project.inlang
COPY apps/api/messages apps/api/messages
COPY apps/api/src apps/api/src
COPY packages/shared/src packages/shared/src
RUN pnpm --filter @adelie/api run paraglide:compile

# Production-only dependency graph for the API and its workspace dependencies.
# `--filter @adelie/api...` limits resolution to @adelie/api plus the
# workspace packages it depends on (skips apps/web entirely).
FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @adelie/api...

# Runtime image: production dependencies plus the application source the API
# executes directly via tsx (no compile step beyond the Paraglide messages
# baked into apps/api/src/lib/paraglide above). No devDependencies, no
# Paraglide/inlang project sources, no tests, no lockfile-adjacent tooling.
# tsx is invoked directly (not via `pnpm start`) so the runtime container
# never needs corepack/pnpm or network access to start.
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY packages/shared/package.json packages/shared/package.json
COPY packages/shared/src packages/shared/src

COPY apps/api/package.json apps/api/package.json
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/drizzle.config.ts apps/api/drizzle.config.ts
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/.env.schema apps/api/.env.schema
COPY --from=build /app/apps/api/src apps/api/src

RUN chown -R node:node /app
USER node

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
