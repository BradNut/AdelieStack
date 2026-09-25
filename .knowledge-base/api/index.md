# API Knowledge Base

Open the smallest file that answers the task. Prefer service docs over broad architecture docs once the target service is known.

## Selector

### Foundation
- [Overview](./overview.md) - API purpose, architecture, and technology stack
- [Core Principles](./core-principles.md) - Design patterns, conventions, and best practices
- [Platform Architecture](./platform-architecture.md) - Infrastructure, deployment, and system design

### Standards
- [Coding Standards](./standards/coding-standards.md) - TypeScript, naming, and code organization
- [API Conventions](./standards/api-conventions.md) - REST patterns, versioning, response formats
- [Testing Standards](./standards/testing-standards.md) - Unit, integration, and coverage requirements
- [Security Standards](./standards/security-standards.md) - Authentication, authorization, data protection
- [Error Handling](./standards/error-handling.md) - Error codes, messages, and response patterns
- [Localisation](./standards/i18n.md) - Paraglide catalogue, compile step, request locale resolution

### Services

#### Identity & Access
- [IAM](./services/iam/overview.md) - Authentication, sessions, password management
- [MFA](./services/mfa/overview.md) - TOTP, passkeys, security keys, recovery codes

#### User Management
- [Users](./services/users/overview.md) - User profiles, preferences, account management

#### Infrastructure
- [Storage](./services/storage/overview.md) - SeaweedFS / S3-compatible object storage, file uploads

### Operations
- [Runbooks](./runbooks/index.md) - Deployment, troubleshooting, maintenance procedures
- [Decisions](./decisions/index.md) - Architectural decision records (ADRs)
- [Glossary](./glossary.md) - Domain terminology and definitions

## Service Doc Shape

- Most services have `overview.md` only.
- IAM also has `api-doc.md`, `business-processes.md`, `context.md`, `data-model.md`, `dependencies.md`, and `runbook.md`.
- If a service doc is absent, inspect `apps/api/src/**` and avoid inventing behavior.
