# API Agent Guide

API work lives in `apps/api` and uses Hono, TypeScript, Drizzle, PostgreSQL, Redis, SeaweedFS (S3), and Mailpit.

## Read Only What You Need

- **First API task or broad change**: [API overview](../../.knowledge-base/api/overview.md) and [core principles](../../.knowledge-base/api/core-principles.md).
- **Route/handler work**: [API conventions](../../.knowledge-base/api/standards/api-conventions.md) plus the relevant service docs from [API index](../../.knowledge-base/api/index.md).
- **Business logic/data access**: the relevant service `overview.md`; read extra IAM subdocs only for IAM internals.
- **Validation/errors/security/tests**: only the matching file in [`standards/`](../../.knowledge-base/api/standards/).
- **Ops/deployment/debugging**: the relevant runbook from [API runbooks](../../.knowledge-base/api/runbooks/index.md).

## API Rules

- **No import-time infrastructure calls**: DB, Redis, storage, email, and telemetry initialize lazily.
- **Drizzle migrations**: never hand-write/edit `drizzle/*.sql` or `drizzle/meta/**`; use Drizzle tooling.
- **Constants before literals**: reuse `@adelie/shared` constants and types before adding strings, numbers, or flags.
- **Server-only stays server-only**: keep secrets/configs/credentials in server-only modules and sanitize responses.
- **Errors**: fix root causes; do not suppress TypeScript or lint warnings without explicit approval.
- **Tests**: changed services/routes need happy-path plus negative/edge coverage.
- **Types**: strict TypeScript, interfaces where practical, `as const` objects over enums.

## Local Map

- **Controllers/routes**: `src/lib/server/api/**/*.controller.ts`, `src/lib/server/api/**/routes/**`
- **Services**: `src/lib/server/api/**/*.service.ts`
- **Repositories**: `src/lib/server/api/**/*.repository.ts`
- **Tables/schema**: `src/lib/server/api/**/tables/**`, `databases/postgres/drizzle-schema.ts`
- **DI/composition**: `application.module.ts`, `application.controller.ts`, `common/factories/**`
- **Middleware**: `common/middleware/**`
- **Validation**: `src/lib/validations/**`
- **i18n**: `messages/{locale}/api.json`, `common/i18n` ([guide](../../.knowledge-base/api/standards/i18n.md))
- **Shared client-safe code**: `@adelie/shared` (`packages/shared/src/**`)
- **Tests**: co-located `tests/` directories next to the module under test

## Adding a Module

1. Create `<module>/` with `*.controller.ts`, `*.service.ts`, `*.repository.ts`, and `tables/` as needed.
2. Register the table in `databases/postgres/drizzle-schema.ts`.
3. Register the controller in `application.controller.ts` so it appears in the RPC contract.
4. Generate the migration with Drizzle tooling; never hand-write SQL.
5. Add happy-path and negative tests under `<module>/tests/`.
