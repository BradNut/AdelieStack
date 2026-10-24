# Agent Guide

AdelieStack is a pnpm + Turbo monorepo: a Hono API (`apps/api`) and a SvelteKit web app (`apps/web`) sharing typed contracts (`packages/shared` for client-safe constants/DTOs/validations, `packages/api-contract` for Hono RPC types).

## Commands

- Use `pnpm` only; tasks run through Turbo.
- `pnpm check`: type-checks web and API and enforces shared-code boundaries.
- `pnpm lint`: Biome (API: full check; web: format check of `src`). `pnpm exec biome check .` covers the whole repo, as CI does.
- `pnpm test`: API and web unit tests. `pnpm test:e2e`: Playwright.
- `pnpm initialize`: Docker infra, storage, DB generate/migrate/seed.

## Where to Look

Locate code with CodeGraph (`codegraph_explore`) first. Then read the nearest guide (both for cross-stack work); it routes to the overview, index and runbooks.

- **API** (route/service/repository/schema): [guide](./apps/api/AGENTS.md), [decisions](./.knowledge-base/api/decisions/index.md)
- **Web** (route/component/form/state/style): [guide](./apps/web/AGENTS.md), [decisions](./.knowledge-base/web/decisions/index.md)

## Non-Negotiable Rules

- **Constants first**: reuse shared/domain constants before adding literals.
- **Boundaries**: server-only code and secrets stay out of client bundles.
- **Const objects**: `as const` objects instead of TypeScript enums.
- **Suppressions**: `@ts-ignore`, `eslint-disable` and `svelte-ignore` need approval.
- **Root causes**: minimal upstream fixes over workarounds.
- **Tests**: happy paths plus negative/edge cases.
- **Drizzle**: migration SQL and metadata come from Drizzle tooling only.
- **Lazy infra**: external connections open on first use, never at import.

## Agent Skills

- **Issue tracker**: GitHub Issues for `BradNut/AdelieStack` via `gh` ([guide](./docs/agents/issue-tracker.md)).
- **Triage labels**: [vocabulary](./docs/agents/triage-labels.md).
- **Domain docs**: `.knowledge-base/{api,web}/glossary.md` and `docs/adr/` ([guide](./docs/agents/domain.md)).
