# Web Agent Guide

Web work lives in `apps/web` and uses SvelteKit 2, Svelte 5 runes, TypeScript, Tailwind CSS v4, Shadcn/UI, Lucide, Vitest, and Playwright. Repo-wide rules are in the root [AGENTS.md](../../AGENTS.md); conventions live in [`standards/`](../../.knowledge-base/web/standards/).

## Read Only What You Need

- **First web task or broad change**: [Web overview](../../.knowledge-base/web/overview.md) and [core principles](../../.knowledge-base/web/core-principles.md).
- **Svelte/SvelteKit code**: the official Svelte plugin (MCP docs and autofixer) supplies its own instructions; use it for Svelte work.
- **Component/UI/route/state work**: [web coding standards](../../.knowledge-base/web/standards/coding-standards.md), then inspect the relevant code.
- **Data fetching**: [data fetching](../../.knowledge-base/web/standards/data-fetching.md).
- **Tests**: [web testing standards](../../.knowledge-base/web/standards/testing-standards.md).
- **Feature work**: relevant feature docs from [Web index](../../.knowledge-base/web/index.md); if absent, inspect code instead of guessing.
- **Ops/deployment/debugging**: the relevant runbook from [Web runbooks](../../.knowledge-base/web/runbooks/index.md).

## Web Rules

- **No client secrets**: expose only sanitized/public values through server `load`, actions, or API responses.
- **Forms**: client constraints must match the server validation limits in `@adelie/shared`.
