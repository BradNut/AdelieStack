FROM mcr.microsoft.com/devcontainers/javascript-node:5.2.6-24

# Install pnpm (the version in the root package.json packageManager), Playwright deps, and additional tools in a single RUN
RUN corepack enable && corepack prepare pnpm@10.26.0 --activate \
    && npx playwright install-deps \
    && apt-get update && apt-get install -y \
        postgresql-client \
        redis-tools \
    && rm -rf /var/lib/apt/lists/*

USER node
