# Web Platform Architecture

## System Architecture

### High-Level Components

```
┌─────────────────┐
│   Browser       │
│   (Client)      │
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────┐
│  SvelteKit App  │
│  (SSR + Client) │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌──────────┐
│ Static │ │ API Proxy│
│ Assets │ │ /api/*   │
└────────┘ └─────┬────┘
              │
              ▼
         ┌──────────┐
         │ Hono API │
         └──────────┘
```

## SvelteKit Architecture

### Rendering Modes

#### Server-Side Rendering (SSR)
- Default for most pages
- Fast initial page load
- SEO-friendly
- Dynamic content

#### Static Site Generation (SSG)
- Pre-rendered at build time
- Fastest possible load
- Used for static pages (about, terms, etc.)
- Set via `export const prerender = true`

#### Client-Side Rendering (CSR)
- Hydration after SSR
- Interactive components
- Dynamic updates without page reload

### Route Structure

```
routes/
├── (app)/                    # Authenticated app layout
│   ├── +layout.svelte       # App shell (nav, sidebar)
│   ├── +layout.server.ts    # Auth check, user data
│   ├── dashboard/
│   │   └── +page.svelte     # User dashboard
│   ├── puzzles/
│   │   ├── +page.svelte     # Puzzle catalog
│   │   └── [id]/
│   │       └── +page.svelte # Puzzle details
│   ├── donate/
│   │   └── +page.svelte     # Donation form
│   └── profile/
│       └── +page.svelte     # User profile
├── (auth)/                   # Auth layout (centered)
│   ├── +layout.svelte       # Auth shell
│   ├── login/
│   │   └── +page.svelte     # Login page
│   ├── signup/
│   │   └── +page.svelte     # Signup page
│   └── reset-password/
│       └── +page.svelte     # Password reset
└── api/                      # API proxy routes
    └── [...path]/
        └── +server.ts        # Proxy to Hono API
```

### Layout Hierarchy

```
+layout.svelte (root)
├── (app)/+layout.svelte
│   ├── dashboard/+page.svelte
│   ├── puzzles/+page.svelte
│   └── profile/+page.svelte
└── (auth)/+layout.svelte
    ├── login/+page.svelte
    └── signup/+page.svelte
```

## Data Flow

### Load Function Flow

```
1. Browser requests /puzzles
   ↓
2. SvelteKit server receives request
   ↓
3. +layout.server.ts load() runs (auth check)
   ↓
4. +page.server.ts load() runs (fetch puzzles)
   ↓
5. API proxy forwards to Hono API
   ↓
6. Hono API returns puzzle data
   ↓
7. SvelteKit renders page with data
   ↓
8. HTML sent to browser
   ↓
9. Client hydrates and becomes interactive
```

### Form Action Flow

```
1. User submits form
   ↓
2. POST to +page.server.ts action
   ↓
3. Server validates data (Zod)
   ↓
4. API proxy forwards to Hono API
   ↓
5. Hono API processes request
   ↓
6. Response returned to SvelteKit
   ↓
7. SvelteKit returns form result
   ↓
8. Page re-renders with result
```

## API Integration

### API Proxy Pattern

```typescript
// routes/api/[...path]/+server.ts
export async function GET({ params, request, cookies }) {
  const apiUrl = `${API_BASE_URL}/${params.path}`;
  
  const response = await fetch(apiUrl, {
    headers: {
      cookie: cookies.get('session')
    }
  });
  
  return new Response(response.body, {
    status: response.status,
    headers: response.headers
  });
}
```

### Type-Safe API Calls

```typescript
import { apiContract } from '@secondchance/api-contract';

// Type-safe API client
const response = await fetch('/api/puzzles');
const puzzles: Puzzle[] = await response.json();
```

## State Management

### Server State (Load Functions)
```typescript
// +page.server.ts
export async function load({ fetch }) {
  const puzzles = await fetch('/api/puzzles');
  return {
    puzzles: await puzzles.json()
  };
}
```

### Component State (Runes)
```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
  
  $effect(() => {
    console.log('Count:', count);
  });
</script>
```

### Global State (Stores)
```typescript
// stores/user.ts
import { writable } from 'svelte/store';

export const currentUser = writable(null);
```

## Build Process

### Development Build
```bash
pnpm dev
# Starts Vite dev server with HMR
# Port: 5173
# Fast rebuilds
```

### Production Build
```bash
pnpm build
# 1. Run svelte-kit sync
# 2. Vite builds client bundle
# 3. Vite builds server bundle
# 4. Generate adapter output
# Output: build/ directory
```

### Build Optimizations
- Tree shaking (remove unused code)
- Code splitting (lazy load routes)
- CSS purging (remove unused Tailwind)
- Asset optimization (images, fonts)
- Minification (JS, CSS, HTML)

## Deployment Architecture

### Coolify Deployment
- **Platform**: Self-hosted Coolify
- **Build**: Turbo monorepo build
- **Container**: Docker with Node.js
- **Adapter**: `@sveltejs/adapter-node`

### Build Steps
1. Install dependencies (pnpm)
2. Build API contract package
3. Build web app with Turbo
4. Create Docker image
5. Deploy to Coolify
6. Health check verification

### Environment Variables
```bash
# API configuration
PUBLIC_API_URL=https://secondchancepuzzles.com/api
ORIGIN=https://secondchancepuzzles.com

# Feature flags
PUBLIC_ENABLE_MFA=true
PUBLIC_ENABLE_DONATIONS=true

# Analytics (optional)
PUBLIC_ANALYTICS_ID=

# Build configuration
NODE_ENV=production
```

## Performance Architecture

### Code Splitting
- Automatic route-based splitting
- Dynamic imports for heavy components
- Lazy load below-the-fold content

### Caching Strategy
```typescript
// Static assets: 1 year
Cache-Control: public, max-age=31536000, immutable

// HTML pages: No cache (SSR)
Cache-Control: no-cache

// API responses: Vary by endpoint
Cache-Control: private, max-age=300
```

### Image Optimization
- Responsive images with srcset
- Lazy loading for off-screen images
- WebP format with fallbacks
- Proper width/height attributes

## Security Architecture

### Content Security Policy
```typescript
// hooks.server.ts
const csp = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'https:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'", '/api']
};
```

### CSRF Protection
- SvelteKit built-in CSRF tokens
- Validated on form submissions
- SameSite cookies

### Session Security
- HttpOnly session cookies
- Secure flag in production
- SameSite=Lax attribute
- Session validation on server

## Monitoring & Observability

### Client-Side Monitoring
- Error tracking (Sentry/Spotlight)
- Performance metrics (Web Vitals)
- User analytics (optional)

### Server-Side Monitoring
- Request logging
- Error logging
- Performance metrics
- Health checks

### Health Check Endpoint
```typescript
// routes/health/+server.ts
export async function GET() {
  return json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
}
```

## Scalability Considerations

### Horizontal Scaling
- Stateless server (sessions in API)
- Load balancer ready
- CDN for static assets
- API proxy distributes load

### Vertical Scaling
- Memory optimization (removed heavy plugins)
- Efficient bundle size
- Lazy loading
- Code splitting

## Related Documentation

- [Overview](./overview.md)
- [Core Principles](./core-principles.md)
- [Runbooks](./runbooks/index.md)
