---
trigger: always_on
---

# Data Fetching

Full guidance: [web data-fetching standards](../../.knowledge-base/web/standards/data-fetching.md).

## Rules

- Default to server-side `load`/actions calling the API over Hono RPC via `honoClient`/`parseApiResponse` in `$lib/utils/api.ts`.
- Browser-side calls go through the `/api/[...slug]` proxy route, never straight to the API origin.
- Branch on `parseApiResponse`'s `{ data, error, status }` result — it does not throw for non-2xx responses.
- TanStack Query is opt-in (`pnpm setup:query`) for client-driven caching/refetching/mutations. Do not reach for it when server `load` already covers the page.
