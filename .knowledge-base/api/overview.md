# API Overview

## Purpose

The Second Chance Puzzles API is a Hono-based backend service that powers the puzzle donation and request platform. It provides RESTful endpoints for user management, authentication, puzzle catalog, donations, and administrative functions.

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
- **ClamAV** - Antivirus scanning for uploaded files
- **Mailpit** - Email testing and delivery
- **Spotlight** - Error tracking and monitoring

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

- **Production URL**: `https://secondchancepuzzles.com/api`
- **Deployment Platform**: Coolify
- **Build Strategy**: Monorepo with Turbo for build orchestration
- **Environment**: Containerized with Docker

## Key Features

- **Multi-Factor Authentication** - TOTP, passkeys, security keys
- **Role-Based Access Control** - Granular permissions system
- **File Upload & Scanning** - Secure file handling with virus scanning
- **Audit Logging** - Comprehensive activity tracking
- **Rate Limiting** - Redis-based request throttling
- **Session Management** - Secure session handling with Redis

## Related Documentation

- [Core Principles](./core-principles.md)
- [Platform Architecture](./platform-architecture.md)
- [Services Index](./index.md#core-services)
