# Better Auth owns the auth core

Spec #2 first planned to port a hand-rolled auth layer built on Oslo libraries. We chose instead to let Better Auth own the user, session, account, second-factor, and passkey tables, and to replace the normalized `roles` / `user_roles` tables with the admin plugin's `role` field (`admin`, `support`, `user`). This removes a large amount of security-critical code that we would have to maintain. It is hard to reverse, because every later feature reads the Better Auth tables and session.

## Considered Options

- **Hybrid**: keep the Oslo tables and put a Better Auth adapter on top. Rejected: two sources of truth for identity.
- **Keep normalized roles**: derive role checks from our own tables. Rejected: it fights the admin plugin and keeps `RolesService` alive for no gain.

## Consequences

- Better Auth is mounted at `/api/auth/*` and uses its own request and response shapes. It is outside the `api-contract` RPC types. The web app uses the Better Auth Svelte client.
- Better Auth tables use `text` ids from our `uuidv7()` through `advanced.database.generateId`. The `public_id` convention stays on domain tables only.
- The template is reset, not migrated. There is no data migration from the old auth tables.
- The `@oslojs/*` packages and the old `credentials`, `two-factor`, and `recovery-codes` tables are removed.
