# Agent Guide

Token-light entry. Read deeper docs only when needed.

## Load Order

1. Nearest guide: [API](./apps/api/AGENTS.md) or [Web](./apps/web/AGENTS.md).
2. If unfamiliar, one overview: [API](./.knowledge-base/api/overview.md) or [Web](./.knowledge-base/web/overview.md).
3. Then only the matching service/feature/standard: [API index](./.knowledge-base/api/index.md) or [Web index](./.knowledge-base/web/index.md).

## Non-Negotiable Rules

- **Constants first**: reuse shared/domain constants before adding literals.
- **Boundaries**: keep server-only code and secrets out of client bundles.
- **Const objects**: prefer `as const` objects over TypeScript enums.
- **No suppressions**: no `@ts-ignore`, `eslint-disable`, or `svelte-ignore` without approval.
- **Root causes**: prefer minimal upstream fixes over workarounds.
- **Tests**: cover happy paths plus negative/edge cases.
- **Drizzle**: never hand-edit migration SQL or metadata; use Drizzle tooling.
- **Lazy infra**: no import-time external connections.

## Scope Router

- **API** (route/service/repository/schema) -> `apps/api/AGENTS.md`.
- **Web** (route/component/form/state/style) -> `apps/web/AGENTS.md`.
- **Cross-stack**: both app guides.
- **Ops**: [API](./.knowledge-base/api/runbooks/index.md) or [Web](./.knowledge-base/web/runbooks/index.md) runbooks.
- **Decisions**: [API](./.knowledge-base/api/decisions/index.md) or [Web](./.knowledge-base/web/decisions/index.md).

## Repo Layout

- `apps/api` Hono API; `apps/web` SvelteKit app.
- `packages/shared` client-safe constants, domain values, DTOs, validations.
- `packages/api-contract` Hono RPC types shared by both apps.
- `.agents/rules` always-on rules; `.agents/skills` invocable skills.

## Stack

Hono, PostgreSQL, Drizzle, Redis, SeaweedFS (S3), Mailpit; SvelteKit 2, Svelte 5 runes, Tailwind v4, Shadcn/UI; TypeScript strict, pnpm, Turbo, Biome, Vitest, Playwright.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `BradNut/AdelieStack` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
