# API Agent Guide

API work lives in `apps/api` and uses Hono, TypeScript, Drizzle, PostgreSQL, Redis, SeaweedFS (S3), and Mailpit. Repo-wide rules are in the root [AGENTS.md](../../AGENTS.md); coding, error, security, and testing rules live in [`standards/`](../../.knowledge-base/api/standards/).

## Read Only What You Need

- **First API task or broad change**: [API overview](../../.knowledge-base/api/overview.md) and [core principles](../../.knowledge-base/api/core-principles.md).
- **Route/handler work**: [API conventions](../../.knowledge-base/api/standards/api-conventions.md) plus the relevant service docs from [API index](../../.knowledge-base/api/index.md).
- **Business logic/data access**: the relevant service `overview.md`; read extra IAM subdocs only for IAM internals.
- **Validation/errors/security/tests/i18n**: only the matching file in [`standards/`](../../.knowledge-base/api/standards/).
- **Ops/deployment/debugging**: the relevant runbook from [API runbooks](../../.knowledge-base/api/runbooks/index.md).

## API Rules

- **Server-only stays server-only**: keep secrets/configs/credentials in server-only modules and sanitize responses.
- **Controllers are the contract**: a controller must be registered in `application.controller.ts` to appear in the RPC contract.

## Code Layout

Modules are organized by feature under `src/lib/server/api`, each with controller, service, repository, and tables, wired together by the application module. See the [API overview](../../.knowledge-base/api/overview.md) and [platform architecture](../../.knowledge-base/api/platform-architecture.md) for the map, and [API conventions](../../.knowledge-base/api/standards/api-conventions.md) for adding a module.
