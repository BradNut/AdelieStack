# Data Fetching

## Decision

1. **Default — server `load`/actions over Hono RPC.** Call the API from `+page.server.ts`,
   `+layout.server.ts`, or form actions using `honoClient`/`parseApiResponse` from
   `$lib/utils/api.ts`. This is SSR, type-safe end to end via `@adelie/api-contract`, and keeps
   secrets and cookies off the client. Use this unless you have a specific reason not to.
2. **Browser-side fetches — the `/api/[...slug]` proxy.** When code in a component or
   browser-only module (`src/lib/client/**`) must call the API directly (not through a server
   `load`), call `honoClient` there too; requests route through
   `src/routes/api/[...slug]/+server.ts`, which forwards method, headers, cookies, and body to
   `API_PROXY_BASE_URL` (default `http://127.0.0.1:3001`) and returns the upstream response
   unchanged. Never point browser code at the API origin directly — it bypasses this proxy and
   its header/cookie handling.
3. **Optional — TanStack Query for client-driven caching.** Not installed by default. Enable with
   `pnpm setup:query` (idempotent; `pnpm setup:query --uninstall` removes it, including the
   dependency). See [Reaching for TanStack Query](#reaching-for-tanstack-query) before adding it.

## `honoClient` / `parseApiResponse`

```typescript
import { honoClient, parseApiResponse } from '$lib/utils/api';

const { data, error, status } = await parseApiResponse(await honoClient(fetch).puzzles.$get());
```

- `honoClient(options?)` wraps `hono/client`'s `hc` and returns the typed `api` surface from
  `@adelie/api-contract`. Pass SvelteKit's event `fetch` when calling from `load`/actions so
  requests carry the request's cookies and participate in SvelteKit's fetch deduping.
- `parseApiResponse<T>(response)` is the standard response shape: `{ data, error, status,
  response }`. It treats `204`/empty bodies as `data: null` on success, and on failure tries to
  parse the body as JSON before falling back to the raw text as `error`. Always branch on
  `error`/`status`, not on catching a thrown exception — `parseApiResponse` does not throw for
  non-2xx responses.
- Surface user-facing failures via SvelteKit's `error()`/`fail()` in `load`/actions, mapped from
  `status`; do not leak raw `error` bodies to the client.

## Reaching for TanStack Query

Worth it when a route needs client-driven behavior that server `load` cannot give you: polling,
refetch-on-focus/interval, optimistic mutations, cross-route cache sharing, or paginated/infinite
lists where the client — not the server render — owns the cache lifecycle.

Not worth it for a page that server `load` already covers well: one-shot SSR reads, form actions,
anything that only needs to be correct at request time. Adding TanStack Query there is extra
dependency and complexity for no behavior change — the data already arrives with the page.

If you do enable it (`pnpm setup:query`), it adds `$lib/query/` (QueryClient factory, typed
query-option factories built on `honoClient`/`parseApiResponse`), a `QueryClientProvider` in the
root layout, and two worked examples under `src/routes/(app)/(public)/examples/`: an
SSR-prefetch-and-hydrate example and an SSR-only fallback. Follow the prefetch example's shape —
prefetch in `load`, dehydrate, hydrate on the client — rather than fetching only in the browser,
so pages still render without JavaScript.
