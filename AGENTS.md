# Agent Guide

AdelieStack is a pnpm + Turbo monorepo: a Hono API (`apps/api`) and a SvelteKit web app (`apps/web`) sharing typed contracts (`packages/shared` for client-safe constants/DTOs/validations, `packages/api-contract` for Hono RPC types). Token-light entry; read deeper docs only when needed.

## Commands

- Package manager: `pnpm` (never npm/yarn). Tasks run through Turbo.
- `pnpm check` type-checks web and API and enforces shared-code boundaries; `pnpm lint` runs Biome on web and API (API: full `biome check`); `pnpm format` runs Biome format.
- `pnpm test` runs API and web unit tests; `pnpm test:e2e` runs Playwright.
- `pnpm initialize` boots local infra (Docker), storage, and runs DB generate/migrate/seed.

## Where to Look

Locate code with CodeGraph (`codegraph_explore`) before grep or Read. Then start with the nearest guide (cross-stack work: both), then one overview if unfamiliar, then only the matching service/feature/standard from the index.

- **API** (route/service/repository/schema): [guide](./apps/api/AGENTS.md), [overview](./.knowledge-base/api/overview.md), [index](./.knowledge-base/api/index.md), [runbooks](./.knowledge-base/api/runbooks/index.md), [decisions](./.knowledge-base/api/decisions/index.md)
- **Web** (route/component/form/state/style): [guide](./apps/web/AGENTS.md), [overview](./.knowledge-base/web/overview.md), [index](./.knowledge-base/web/index.md), [runbooks](./.knowledge-base/web/runbooks/index.md), [decisions](./.knowledge-base/web/decisions/index.md)

## Non-Negotiable Rules

- **Constants first**: reuse shared/domain constants before adding literals.
- **Boundaries**: keep server-only code and secrets out of client bundles.
- **Const objects**: prefer `as const` objects over TypeScript enums.
- **No suppressions**: no `@ts-ignore`, `eslint-disable`, or `svelte-ignore` without approval.
- **Root causes**: prefer minimal upstream fixes over workarounds.
- **Tests**: cover happy paths plus negative/edge cases.
- **Drizzle**: never hand-edit migration SQL or metadata; use Drizzle tooling.
- **Lazy infra**: no import-time external connections.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `BradNut/AdelieStack` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `.knowledge-base/{api,web}/glossary.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
