# Web Agent Guide

Web work lives in `apps/web` and uses SvelteKit 2, Svelte 5 runes, TypeScript, Tailwind CSS v4, Shadcn/UI, Lucide, Vitest, and Playwright.

## Read Only What You Need

- **First web task or broad change**: [Web overview](../../.knowledge-base/web/overview.md) and [core principles](../../.knowledge-base/web/core-principles.md).
- **Svelte/SvelteKit code**: use the Svelte MCP docs/autofixer workflow required by [`.agents/rules/01-key-principles.md`](../../.agents/rules/01-key-principles.md).
- **Component/UI/route/state work**: [web coding standards](../../.knowledge-base/web/standards/coding-standards.md), then inspect the relevant code.
- **Tests**: [web testing standards](../../.knowledge-base/web/standards/testing-standards.md).
- **Feature work**: relevant feature docs from [Web index](../../.knowledge-base/web/index.md); if absent, inspect code instead of guessing.
- **Ops/deployment/debugging**: the relevant runbook from [Web runbooks](../../.knowledge-base/web/runbooks/index.md).

## Web Rules

- **Svelte 5 first**: use runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`) and SvelteKit conventions.
- **Server/client boundary**: never import server-only modules into components, pages, or other client-bundled code.
- **No client secrets**: expose only sanitized/public values through server `load`, actions, or API responses.
- **Constants before literals**: reuse `@adelie/shared` constants and validation limits before adding new values.
- **Forms**: client constraints must match the server validation limits in `@adelie/shared`.
- **Errors**: fix root causes; no `svelte-ignore`, `@ts-ignore`, or lint suppressions without explicit approval.
- **Tests**: changed components/routes/actions need happy-path plus negative/edge coverage.
- **Types**: strict TypeScript, interfaces where practical, `as const` objects over enums.

## Data Access

- **Default**: server-side `load`/actions calling the API over Hono RPC (`$lib/utils/api.ts`).
- **Client-side**: browser requests go through the `/api/[...slug]` proxy route to the API.
- **Optional**: TanStack Query for client-driven caching. Enable with `pnpm setup:query`. See [data fetching](../../.knowledge-base/web/standards/data-fetching.md).

## Local Map

- **Routes/pages/layouts**: `src/routes/**`
- **API proxy**: `src/routes/api/[...slug]/+server.ts`
- **Components**: `src/lib/components/**` (Shadcn primitives in `components/ui/**`)
- **Browser-only helpers**: `src/lib/client/**`
- **Client-safe shared code**: `@adelie/shared`, `src/lib/utils/**`
- **Server-only code**: `src/lib/server/**`, `+page.server.ts`, `+layout.server.ts`, `+server.ts`
- **E2E tests**: `e2e/**`
