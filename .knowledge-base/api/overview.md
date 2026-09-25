# API Overview

## Purpose

The AdelieStack API (`@adelie/api`) is a Hono-based backend service for a generic authentication
and account-settings starter application. It provides RESTful endpoints for identity/access
management (signup, login, sessions, password reset), multi-factor authentication (TOTP), user
and role management, and file storage.

## Technology Stack

### Core Framework
- **Hono** - Fast, lightweight web framework for edge computing
- **TypeScript** - Type-safe development
- **Node.js** - Runtime environment

### Data Layer
- **Drizzle ORM** - Type-safe database toolkit
- **PostgreSQL** - Primary relational database
- **Redis** - Caching and session storage (via ioredis)

### Infrastructure Services
- **SeaweedFS** - S3-compatible object storage for file uploads (any S3 provider in production)
- **Mailpit** - Email testing and delivery
- **Spotlight** - Error tracking and monitoring

> **Note:** `clamscan` is listed as a dependency in `apps/api/package.json`, but it is not
> imported or used anywhere in `apps/api/src`. Antivirus scanning is not a shipped feature —
> treat ClamAV as an unused/unwired dependency.

### Development Tools
- **Docker Compose** - Local development environment
- **Vitest** - Testing framework
- **Biome** - Linting and formatting

## Architecture Principles

1. **Service-Oriented Design** - Domain services organized by business capability
2. **Type Safety** - Comprehensive TypeScript usage with strict mode
3. **Lazy Initialization** - Services initialized on-demand to prevent build-time connections
4. **Separation of Concerns** - Clear boundaries between routes, services, and data access
5. **Security First** - Authentication, authorization, and data validation at all layers

## Deployment

- **Deployment Platform**: Coolify (Nixpacks or Docker build), see
  [deployment runbook](./runbooks/deployment.md) for the concrete build/host details — no public
  production domain is documented in this repo.
- **Build Strategy**: Monorepo with Turbo for build orchestration
- **Environment**: Containerized with Docker

## Key Features

- **Multi-Factor Authentication** - TOTP-based MFA
- **Role-Based Access Control** - Permissions via roles module
- **File Upload & Image Processing** - SeaweedFS/S3-compatible storage with server-side image
  resizing (no virus scanning — see ClamAV note above)
- **Rate Limiting** - Redis-based request throttling
- **Session Management** - Secure session handling with Redis

## Related Documentation

- [Core Principles](./core-principles.md)
- [Platform Architecture](./platform-architecture.md)
- [Services Index](./index.md#core-services)
