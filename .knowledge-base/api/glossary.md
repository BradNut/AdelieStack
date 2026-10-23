# API Glossary

## Authentication & Authorization

**Auth Core**
The part of the system that proves who a person is and what they may do: users, sessions, second factors, passkeys and roles. Better Auth owns it; see [ADR 0009](../../docs/adr/0009-better-auth-owns-the-auth-core.md).
_Avoid_: IAM, login system

**Authentication**
The process of verifying a user's identity through credentials (password, passkey, etc.).

**Authorization**
The process of determining what actions an authenticated user is allowed to perform.

**Session**
A temporary authentication state, stored in the `sessions` table through Better Auth's database adapter (not Redis), that identifies an authenticated user.

**TOTP (Time-based One-Time Password)**
A temporary password that changes every 30 seconds, used for multi-factor authentication.

**Second Factor**
An extra proof of identity asked after the password on an account with two-factor enabled: a TOTP code, an emailed one-time code or a Recovery Code. Asking for it is the Two-factor Challenge (web glossary).
_Avoid_: MFA step, 2FA token

**Recovery Code**
A single-use code that replaces a Second Factor when the user has lost their authenticator. Better Auth's API calls these backup codes (`/two-factor/verify-backup-code`).
_Avoid_: Backup code (outside Better Auth paths), reset code

**Passkey**
A WebAuthn credential that uses public key cryptography for passwordless authentication.

**Captcha Provider**
The third-party service (Cloudflare Turnstile, Google reCAPTCHA, hCaptcha, CaptchaFox) that issues and verifies Captcha Tokens. Chosen per deployment through environment configuration; captcha is off unless enabled.

**Captcha Token**
The single-use proof a client obtains from the Captcha Provider's widget and submits with a protected request.

**MFA (Multi-Factor Authentication)**
Security mechanism requiring multiple forms of verification to authenticate.

**RBAC (Role-Based Access Control)**
Authorization model where permissions are assigned to roles, and roles to users.

**Role**
A named group of permissions assigned to a user: `admin`, `support` or `user` (`RoleName` in `@adelie/shared`). Better Auth's admin plugin stores it on `users.role`; `rolesOf` in `auth/roles.ts` is the only reader. More than one role per user is allowed only when `ALLOW_MULTIPLE_ROLES` is on.

**Permission**
An action on a resource (for example `user: ban`) that a role grants, defined by `ac` and `roles` in `auth/auth.permissions.ts`. Routes check permissions through Better Auth's `userHasPermission`, not role names. See [ADR 0002](../../docs/adr/0002-authorization-delegates-to-better-auth.md).

**Role Policy**
The rules for which roles a user may hold and how a stored role value becomes the roles a permission check uses: one role per user unless multiple roles are allowed, and the least-privileged role for anything empty or unknown. Applies when roles are written and when they are read.

**Provider Health**
Whether the most recent call to an external screening provider (the Captcha Provider, Have I Been Pwned) reached it: disabled, unknown (no call since start), available or unavailable. Reported on the health endpoint without calling the provider again.

**Security Event**
An account change the user is told about by email: password changed, Recovery Code used, Recovery Codes regenerated, and email address changed (sent to the old address). Sent from the after-hook in `auth/auth.mail.ts`.
_Avoid_: Alert, notification

## Data & Storage

**Drizzle ORM**
Type-safe database toolkit for TypeScript used for database queries and migrations.

**SeaweedFS**
S3-compatible object storage used for file uploads in local development.

**Redis**
In-memory data store used for sessions, caching, and rate limiting.

**Migration**
Database schema change managed through Drizzle tooling.

**Schema**
Database table structure definition.

**Repository**
Data access layer that encapsulates database queries.

## API Concepts

**Endpoint**
A specific URL path and HTTP method combination that performs an action.

**Route Handler**
Function that processes requests for a specific endpoint.

**Middleware**
Function that processes requests before they reach the route handler.

**Validation Schema**
Zod schema that defines expected request data structure.

**Rate Limiting**
Restricting the number of requests a client can make in a time window.

**CORS (Cross-Origin Resource Sharing)**
Security mechanism that controls which origins can access the API.

**CSRF (Cross-Site Request Forgery)**
Attack where unauthorized commands are transmitted from a trusted user.

## Service Architecture

**Service Layer**
Business logic layer that orchestrates operations across repositories.

**Repository Layer**
Data access layer that interacts with the database.

**Route Layer**
HTTP request handling layer that validates input and calls services.

**Lazy Initialization**
Pattern where resources are created only when first needed, not at import time.

**Dependency Injection**
Pattern where dependencies are provided to a class rather than created internally.

## Security

**Argon2**
Password hashing algorithm used for secure password storage (via the `argon2` package,
wrapped by `HashingService`). Not bcrypt.

**Salt**
Random data added to passwords before hashing.

**Hash**
One-way cryptographic function output, used for password storage.

**Token**
A random string used for password resets or temporary authentication.

**Presigned URL**
Temporary URL that grants access to a private S3 object.

**ClamAV**
Antivirus engine; listed as a dependency (`clamscan`) but not wired into the upload path.

## Monitoring & Operations

**Audit Log**
Record of security-relevant events for compliance and investigation.

**Health Check**
Endpoint that reports service and dependency status.

**Circuit Breaker**
Pattern that prevents cascading failures by stopping requests to failing services.

**Retry Strategy**
Policy for retrying failed operations with backoff.

**Graceful Degradation**
Continuing to operate with reduced functionality when dependencies fail.

## Development

**Hono**
Fast, lightweight web framework for building APIs.

**Zod**
TypeScript-first schema validation library.

**Vitest**
Testing framework for unit and integration tests.

**Biome**
Linter and formatter for code quality.

**Turbo**
Monorepo build system for orchestrating builds.

**pnpm**
Fast, disk-efficient package manager.

## Deployment

**Coolify**
Self-hosted deployment platform used for production.

**Docker**
Containerization platform for packaging applications.

**Environment Variable**
Configuration value stored outside code (e.g., API keys).

**Build Time**
When the application is compiled/bundled.

**Runtime**
When the application is executing.

**TTL (Time To Live)**
Duration before a cached item or session expires.

## HTTP & REST

**GET**
HTTP method for retrieving resources (idempotent, safe).

**POST**
HTTP method for creating resources.

**PATCH**
HTTP method for partial resource updates.

**DELETE**
HTTP method for removing resources.

**Idempotent**
Operation that produces the same result when called multiple times.

**Status Code**
Three-digit number indicating the result of an HTTP request.

**Request Body**
Data sent with POST/PATCH requests.

**Query Parameter**
URL parameter for filtering or pagination (e.g., `?page=1`).

**Header**
Metadata sent with HTTP requests/responses.

**Cookie**
Small piece of data stored by the browser and sent with requests.
