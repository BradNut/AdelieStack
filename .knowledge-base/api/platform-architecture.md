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
- **Purpose**: Primary data store for users, puzzles, donations, requests
- **ORM**: Drizzle with type-safe queries
- **Migrations**: Managed via `drizzle-kit`
- **Connection**: Pooled connections with lazy initialization

#### Redis Cache
- **Purpose**: Session storage, rate limiting, caching
- **Client**: ioredis with `lazyConnect: true`
- **Configuration**: Lazy getter pattern to prevent build-time connections
- **Use Cases**: User sessions, API rate limits, temporary data

#### SeaweedFS Object Storage
- **Purpose**: S3-compatible file storage for puzzle images and attachments
- **Integration**: AWS SDK v3
- **Features**: S3 API on `:8333`; public-read granted via `docker/seaweedfs/s3-config.json`
- **Security**: ClamAV antivirus scanning on upload

#### Mailpit
- **Purpose**: Email testing and delivery in development
- **Integration**: SMTP transport
- **Use Cases**: Password reset, verification emails, notifications

#### ClamAV
- **Purpose**: Antivirus scanning for uploaded files
- **Integration**: ClamAV daemon via TCP socket
- **Process**: Scan before storage, reject infected files

#### Spotlight
- **Purpose**: Error tracking and application monitoring
- **Integration**: Sentry SDK
- **Features**: Error reporting, performance monitoring, release tracking

## Deployment Architecture

### Coolify Deployment
- **Platform**: Self-hosted Coolify instance
- **Build**: Turbo monorepo build with `--filter=@secondchance/api`
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
- **Production**: `https://secondchancepuzzles.com/api`
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
2. Validate against database (bcrypt hash)
3. Create session in Redis
4. Return session cookie
5. Subsequent requests include session cookie
6. Middleware validates session from Redis

### File Upload Flow
1. Client uploads file via multipart form
2. API receives and validates file type/size
3. ClamAV scans file for viruses
4. If clean, upload to the storage bucket
5. Store metadata in PostgreSQL
6. Return file URL to client

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
