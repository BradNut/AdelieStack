# Web Core Principles

The repo-wide rules (constants first, `as const` objects, server/client boundaries, no suppressions,
tests) live in the root [AGENTS.md](../../AGENTS.md); this file does not repeat them. Svelte 5 runes,
Tailwind and accessibility basics come from the Svelte plugin's docs and autofixer. Conventions
specific to this repo are in [Coding Standards](./standards/coding-standards.md).

## Boundaries

- Server-only code lives in `src/lib/server/**`, client-only code in `src/lib/client/**`, shared code
  in `src/lib/utils/**` or `@adelie/shared`.
- Import app code through the `#lib` subpath alias.

## Progressive Enhancement

Forms work without JavaScript: submit through SvelteKit form actions, then enhance with
`use:enhance` and client-side validation. See [Forms](./standards/forms.md).

## Server State

`event.locals.api` (a `honoClient` wired up in `hooks.server.ts`) is available to every server
`load` and action. There is no global writable store for user or session state. Fetch data over Hono
RPC with `honoClient`/`parseApiResponse` (`#lib/utils/api.ts`), not raw `fetch('/api/...')`; the full
pattern, including the browser-side proxy, is in [Data Fetching](./standards/data-fetching.md).

## Related Documentation

- [Overview](./overview.md)
- [Coding Standards](./standards/coding-standards.md)
