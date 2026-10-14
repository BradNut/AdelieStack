# API Knowledge Base

Open the smallest file that answers the task. Prefer service docs over broad architecture docs once the target service is known.

## Selector

- Foundation: [Overview](./overview.md), [Core Principles](./core-principles.md), [Platform Architecture](./platform-architecture.md)
- Standards: [Coding](./standards/coding-standards.md), [API Conventions](./standards/api-conventions.md), [Testing](./standards/testing-standards.md), [Security](./standards/security-standards.md), [Error Handling](./standards/error-handling.md), [Localisation](./standards/i18n.md) (Paraglide catalogue, compile step, request locale)
- Services: [IAM](./services/iam/overview.md), [MFA](./services/mfa/overview.md), [Users](./services/users/overview.md), [Storage](./services/storage/overview.md)
- Operations: [Runbooks](./runbooks/index.md), [Decisions](./decisions/index.md), [Glossary](./glossary.md)

## Service Doc Shape

- Most services have `overview.md` only.
- IAM also has `business-processes.md`, `context.md`, `data-model.md`, and `runbook.md`.
- Routes, schema, and dependencies are not documented: locate them in `apps/api/src/**` with CodeGraph.
