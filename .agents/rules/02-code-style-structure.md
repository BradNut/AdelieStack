---
trigger: always_on
---

# Code Style and Structure

## General Guidelines

- Functional/declarative patterns. No classes except state machines.
- Modularize over duplicate. File order: logic, markup, styles, helpers, types.

## Shared and Server Boundaries

- Reusable constants/shared domain values → `src/lib/shared/**` (client-safe).
- **Reuse existing constants before adding new literals** (strings/numbers/flags).
- Server-only code/secrets → `src/lib/server/**`, `+page.server.ts`, `+layout.server.ts`, `+server.ts`.
- Never import server-only modules into components/pages/client bundles.
- Never expose secrets or private env vars to client; return sanitized values via `load` or API.

## Drizzle Migration Discipline

- Never hand-write, manually create, or manually edit migration SQL in `drizzle/*.sql`.
- Never hand-create or hand-edit Drizzle metadata/journal files in `drizzle/meta/**` (including `_journal.json` and snapshots).
- Always generate and apply migrations via Drizzle tooling (`drizzle-kit generate` and migration commands) so SQL and meta files stay aligned.

## File Organization

```
src/
├── lib/
│   ├── components/
│   ├── utils/
│   └── types/
├── routes/
│   ├── +layout.svelte
│   ├── +page.svelte
│   └── api/
└── app.html
```
