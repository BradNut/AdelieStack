---
trigger: always_on
---

# Key Principles

Stack: Svelte 5, SvelteKit 2, TypeScript strict, Tailwind v4, Shadcn/UI.

## Rules

- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`, `$bindable`). No legacy Svelte 4 reactivity.
- Fix root causes. No `svelte-ignore`, `@ts-ignore`, `eslint-disable` without explicit user approval.
- Minimal client JS. Prefer SSR/SSG. File-based routing conventions.

## Svelte MCP — Required Workflow

1. **Any Svelte task**: call `list-sections` first → analyze `use_cases` → call `get-documentation` for all relevant sections.
2. **Before sending Svelte code**: call `svelte-autofixer`. Repeat until no issues.
3. **Playground link**: ask user first. Never call if code written to project files.