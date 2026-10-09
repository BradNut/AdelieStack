FROM mcr.microsoft.com/devcontainers/javascript-node:22

# Install pnpm, Playwright deps, and additional tools in a single RUN
RUN corepack enable && corepack prepare pnpm@latest --activate \
    && npx playwright install-deps \
    && apt-get update && apt-get install -y \
        postgresql-client \
        redis-tools \
    && rm -rf /var/lib/apt/lists/*

USER node
