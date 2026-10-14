# API Agent Guide

Repo-wide rules are in the root [AGENTS.md](../../AGENTS.md); coding, error, security, and testing rules live in [`standards/`](../../.knowledge-base/api/standards/).

## Read Only What You Need

- **First API task or broad change**: [API overview](../../.knowledge-base/api/overview.md) and [core principles](../../.knowledge-base/api/core-principles.md).
- **Route/handler work**: [API conventions](../../.knowledge-base/api/standards/api-conventions.md) plus the relevant service docs from [API index](../../.knowledge-base/api/index.md).
- **Business logic/data access**: the relevant service `overview.md`; read extra IAM subdocs only for IAM internals.
- **Validation/errors/security/tests/i18n**: only the matching file in [`standards/`](../../.knowledge-base/api/standards/).
- **Ops/deployment/debugging**: the relevant runbook from [API runbooks](../../.knowledge-base/api/runbooks/index.md).

## API Rules

- **Server-only stays server-only**: keep secrets/configs/credentials in server-only modules and sanitize responses.
- **Controllers are the contract**: a controller must be registered in `application.controller.ts` to appear in the RPC contract.
