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
- **Security**: uploads are scanned before they reach storage when `ANTIVIRUS_ENABLED` is on —
  see ClamAV below

#### Mailpit
- **Purpose**: Email testing and delivery in development
- **Integration**: SMTP transport
- **Use Cases**: Password reset, verification emails, notifications

#### ClamAV
- **Purpose**: Virus scanning of uploaded files
- **Integration**: `clamscan` client talking to a clamd daemon over TCP
  (`storage/virus-scanner.service.ts`); the connection opens on the first scan
- **Configuration**: `ANTIVIRUS_ENABLED` (default `false`), `CLAMAV_HOST`, `CLAMAV_PORT`. When
  disabled, scans report clean without contacting clamd and objects get no scan tags
- **Failure mode**: the upload path fails closed. If the scanner errors, for example because clamd
  is unreachable, the upload is refused and nothing is stored
- **Known gap**: on a clamd read timeout or a reply it cannot parse, `clamscan` resolves with
  `isInfected: null` instead of erroring. `VirusScannerService.scanStream` counts that as clean, so
  those files are stored and tagged clean
- **Webhook re-scan**: as defense-in-depth, objects are re-scanned after they land when the storage
  provider is configured to send object-created notifications to the storage webhook
  (`storage/file-scanner.worker.ts`); nothing in the local stack sets that up. Infected objects are
  deleted; a scanner error only tags the object `error` and leaves it in place

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
3. Resize via `sharp` if the upload requests a width or height
4. Scan the final bytes with ClamAV, when `ANTIVIRUS_ENABLED` is on, so resized output is what
   gets checked. Infected files are rejected with 422; if the scanner errors the upload fails
   closed with 503. Either way nothing reaches storage
5. Upload to the storage bucket and, when scanning is on, tag the object `scan-status=clean`
6. Store metadata in PostgreSQL
7. Return file URL to client

> `StorageService.upload` implements steps 3-5. The template ships no upload route that calls it, so
> steps 1, 2, 6 and 7 are what an app's own route adds around it.

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
