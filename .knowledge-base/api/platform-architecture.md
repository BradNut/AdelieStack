# API Platform Architecture

## System Architecture

### High-Level Components

```
┌─────────────────┐
│   Web Client    │
│  (SvelteKit)    │
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────┐
│   API Gateway   │
│  /api/* proxy   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Hono API      │
│   (Node.js)     │
└────────┬────────┘
         │
    ┌────┴────┬──────────┬──────────┐
    ▼         ▼          ▼          ▼
┌────────┐ ┌──────┐ ┌────────┐ ┌──────┐
│ Postgres│ │ Redis│ │   S3   │ │ Mail │
└─────────┘ └──────┘ └────────┘ └──────┘
```

### Infrastructure Services

#### PostgreSQL Database
- **Purpose**: Primary data store for users, roles, sessions, and account/auth records
- **ORM**: Drizzle with type-safe queries
- **Migrations**: Managed via `drizzle-kit`
- **Connection**: Pooled connections with lazy initialization

#### Redis Cache
- **Purpose**: Session storage, rate limiting, caching
- **Client**: ioredis with `lazyConnect: true`
- **Configuration**: Lazy getter pattern to prevent build-time connections
- **Use Cases**: User sessions, API rate limits, temporary data

#### SeaweedFS Object Storage
- **Purpose**: S3-compatible object storage for user-uploaded files
- **Integration**: AWS SDK v3
- **Features**: S3 API on `:8333`; public-read granted via `docker/seaweedfs/s3-config.json`;
  server-side image resizing via `sharp` (`storage/images.service.ts`)
- **Security**: no antivirus scanning is wired up — see ClamAV note below

#### Mailpit
- **Purpose**: Email testing and delivery in development
- **Integration**: SMTP transport
- **Use Cases**: Password reset, verification emails, notifications

#### ClamAV (unused dependency)
- **Status**: `clamscan` is listed as a dependency in `apps/api/package.json` but is not
  imported or referenced anywhere in `apps/api/src`. There is no antivirus scanning in the
  upload path today — this is a declared dependency, not a shipped feature.

#### Spotlight
- **Purpose**: Error tracking and application monitoring
- **Integration**: Sentry SDK
- **Features**: Error reporting, performance monitoring, release tracking

## Deployment Architecture

### Coolify Deployment
- **Platform**: Self-hosted Coolify instance (Nixpacks or Docker build — see
  `apps/api/nixpacks.toml` / `apps/api/Dockerfile`)
- **Build**: Turbo/pnpm build scoped with `--filter @adelie/api...`
- **Container**: Docker with Node.js runtime
- **Environment**: Production environment variables via Coolify secrets

### Build Process
1. Install dependencies with pnpm
2. Run Turbo build for API workspace
3. Generate Drizzle migrations (if needed)
4. Build TypeScript to JavaScript
5. Create production Docker image
6. Deploy to Coolify with health checks

### Memory Optimization
- Removed heavy build plugins to reduce memory usage
- Lazy service initialization prevents OOM during builds
- Redis lazy connect prevents connection attempts at build time
- Optimized for ~3GB RSS during production builds

## Network Architecture

### URL Structure
- **Production**: no fixed public domain is documented in this repo; the API listens on port
  3001 behind Coolify (see [deployment runbook](./runbooks/deployment.md))
- **Local Development**: `http://localhost:3000`
- **API Proxy**: Web app proxies `/api/*` to API service

### CORS & Security
- CORS configured for web domain
- CSRF protection for state-changing operations
- Secure headers (HSTS, CSP, X-Frame-Options)
- Rate limiting per IP and per user

## Data Flow

### Request Lifecycle
1. **Client Request** → Web app or direct API call
2. **Proxy/Gateway** → Route to API service
3. **Middleware Chain** → Auth, rate limit, CORS, logging
4. **Route Handler** → Validate request, call service
5. **Service Layer** → Business logic, orchestration
6. **Repository Layer** → Database queries via Drizzle
7. **Response** → Standardized JSON response

### Authentication Flow
1. User submits credentials
2. Validate against database (Argon2 hash via `HashingService`)
3. Create session in Redis
4. Return session cookie
5. Subsequent requests include session cookie
6. Middleware validates session from Redis

### File Upload Flow
1. Client uploads file via multipart form
2. API receives and validates file type/size
3. Upload to the storage bucket (image files may be resized via `sharp` first)
4. Store metadata in PostgreSQL
5. Return file URL to client

> No virus-scanning step exists in this flow today (see ClamAV note above).

## Monitoring & Observability

### Logging
- Structured JSON logs
- Request/response logging
- Error stack traces
- Performance metrics

### Error Tracking
- Spotlight/Sentry integration
- Automatic error capture
- Source maps for stack traces
- Release tracking

### Health Checks
- `/health` endpoint for liveness
- Database connection check
- Redis connection check
- Service dependency status

## Scaling Considerations

### Horizontal Scaling
- Stateless API design (sessions in Redis)
- Load balancer ready
- Shared Redis for session consistency
- Shared PostgreSQL with connection pooling

### Vertical Scaling
- Memory optimization for build and runtime
- Efficient database queries with indexes
- Redis caching for hot data
- Lazy service initialization

## Related Documentation

- [Overview](./overview.md)
- [Core Principles](./core-principles.md)
- [Runbooks](./runbooks/index.md)
