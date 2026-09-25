# API Glossary

## Authentication & Authorization

**Authentication**
The process of verifying a user's identity through credentials (password, passkey, etc.).

**Authorization**
The process of determining what actions an authenticated user is allowed to perform.

**Session**
A temporary authentication state stored in Redis that identifies an authenticated user.

**TOTP (Time-based One-Time Password)**
A temporary password that changes every 30 seconds, used for multi-factor authentication.

**Passkey**
A WebAuthn credential that uses public key cryptography for passwordless authentication.

**MFA (Multi-Factor Authentication)**
Security mechanism requiring multiple forms of verification to authenticate.

**RBAC (Role-Based Access Control)**
Authorization model where permissions are assigned to roles, and roles to users.

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

**bcrypt**
Password hashing algorithm used for secure password storage.

**Salt**
Random data added to passwords before hashing.

**Hash**
One-way cryptographic function output, used for password storage.

**Token**
A random string used for password resets or temporary authentication.

**Presigned URL**
Temporary URL that grants access to a private S3 object.

**ClamAV**
Antivirus engine used to scan uploaded files.

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
