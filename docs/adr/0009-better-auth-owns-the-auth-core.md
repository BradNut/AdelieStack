---
status: accepted
---

# Better Auth owns the auth core

Spec #2 first planned to port a hand-rolled auth layer built on Oslo libraries. We chose instead to let Better Auth own the user, session, account, second-factor and passkey tables, and to replace the normalized `roles` / `user_roles` tables with the admin plugin's `role` field (`admin`, `support`, `user`). This removes a large amount of security-critical code that we would otherwise maintain. It is hard to reverse, because every later feature reads the Better Auth tables and session.

## Consequences

- Better Auth is mounted at `/api/auth/*` and uses its own request and response shapes. It is outside the `api-contract` RPC types; the web app uses the Better Auth Svelte client.
- Better Auth tables use `text` ids from our `uuidv7()` through `advanced.database.generateId` (`generateAuthId` in `auth.config.ts`).
- The template was reset, not migrated: there is no data migration from the old auth tables.
- The `@oslojs/*` packages and the old `credentials`, `two-factor` and `recovery-codes` tables were removed.
- Later auth decisions build on this one: authorization ([ADR 0002](./0002-authorization-delegates-to-better-auth.md)), captcha ([ADR 0004](./0004-captcha-via-better-auth-plugin.md)) and rate limiting ([ADR 0006](./0006-better-auth-owns-auth-rate-limiting.md)).

## Considered options

- Hybrid: keep the Oslo tables and put a Better Auth adapter on top. Rejected: two sources of truth for identity.
- Keep normalized roles and derive role checks from our own tables. Rejected: it fights the admin plugin and keeps `RolesService` alive for no gain.
