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
├── (app)/
│   ├── +layout.svelte                    # App shell
│   ├── +page.svelte / +page.server.ts    # root app page
│   ├── (public)/
│   │   ├── privacy-policy/+page.svelte
│   │   └── terms/+page.svelte
│   └── (protected)/
│       └── settings/
│           ├── +layout.svelte
│           ├── +page.svelte / +page.server.ts
│           └── account/+page.svelte / +page.server.ts
├── (auth)/                               # Auth layout (centered)
│   ├── +layout.svelte
│   ├── +layout.server.ts                 # redirect if already authed
│   ├── login/
│   │   ├── +page.svelte / +page.server.ts
│   │   └── google/+server.ts             # Google OAuth kickoff
│   ├── signup/+page.svelte / +page.server.ts
│   ├── password/reset/+page.svelte / +page.server.ts
│   └── auth/callback/google/+server.ts   # Google OAuth callback
└── api/
    └── [...slug]/+server.ts              # Proxy to Hono API
```

### Layout Hierarchy

```
+layout.svelte (root)
├── (app)/+layout.svelte
│   ├── +page.svelte
│   ├── (public)/privacy-policy/+page.svelte
│   ├── (public)/terms/+page.svelte
│   └── (protected)/settings/+layout.svelte
│       ├── +page.svelte
│       └── account/+page.svelte
└── (auth)/+layout.svelte
    ├── login/+page.svelte
    ├── signup/+page.svelte
    └── password/reset/+page.svelte
```

## Data Flow

### Load Function Flow

```
1. Browser requests /settings
   ↓
2. SvelteKit server receives request
   ↓
3. hooks.server.ts builds event.locals.api (honoClient)
   ↓
4. +page.server.ts load() runs, calls locals.api.<resource>.$get()
   ↓
5. Hono API returns data
   ↓
6. parseApiResponse normalizes the response
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
4. Action calls locals.api.<resource>.$post() (honoClient)
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

Two patterns, both over the type-safe `honoClient` from `@adelie/api-contract` — never raw
`fetch('/api/...')`. Full decision and examples: [Data Fetching](./standards/data-fetching.md).

### Server load/actions — `event.locals.api`

`src/hooks.server.ts` builds a `honoClient` once per request (carrying `x-forwarded-for` and
`host`) and attaches it to `event.locals`, alongside `parseApiResponse` and auth helpers:

```typescript
// src/hooks.server.ts (actual pattern)
const api: Api = honoClient({
  fetch: event.fetch,
  headers: {
    'x-forwarded-for': event.getClientAddress(),
    host: event.request.headers.get('host') || '',
  },
});

event.locals.api = api;
event.locals.parseApiResponse = parseApiResponse;
```

`+page.server.ts`/`+layout.server.ts`/actions then call `locals.api.<resource>.$get()` and pass
the result through `locals.parseApiResponse`.

### Browser-side — the `/api/[...slug]` proxy

Code in `src/lib/client/**` or components that must call the API outside a server `load` uses
`honoClient(fetch)` too; requests are routed through `src/routes/api/[...slug]/+server.ts`, which
forwards method, headers, cookies, and body to `API_PROXY_BASE_URL` (default
`http://127.0.0.1:3001`) and returns the upstream response unchanged — it does not read
individual cookies or reconstruct headers by hand.

## State Management

### Server State (Load Functions)
```typescript
// +page.server.ts
import { honoClient, parseApiResponse } from '$lib/utils/api';

export async function load({ fetch }) {
  const { data } = await parseApiResponse(await honoClient(fetch).users.me.$get());
  return { user: data };
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

There is no global writable store for user/session state; server `load` re-fetches via
`locals.api` where needed.

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

Deployed to Coolify as a Docker container built through the Turbo monorepo, using
`@sveltejs/adapter-node`. For the actual build steps, environment variables, and rollback
procedure, see the [Deployment runbook](./runbooks/deployment.md) and
[Environment Configuration runbook](./runbooks/environment-config.md) — this doc does not
duplicate them, to avoid drift.

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

Defined in `apps/web/csp-directives.mjs` and consumed by `svelte.config.js`
(`kit.csp.directives`); SvelteKit's `csp.mode: 'auto'` hashes the framework's own inline bootstrap
script, so `script-src` does not need `'unsafe-inline'`:

```javascript
// apps/web/csp-directives.mjs (actual directives)
const cspDirectives = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'connect-src': ["'self'" /* + local Spotlight origin when NODE_ENV is development */],
  'font-src': ["'self'", 'data:'],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"],
  'frame-src': ["'self'"],
  'img-src': ["'self'", 'data:', 'https://images.unsplash.com' /* + PUBLIC_IMAGE_URI origin */],
  'manifest-src': ["'self'"],
  'media-src': ["'self'"],
  'object-src': ["'none'"],
  'script-src': ["'self'"], // SvelteKit adds the per-request nonce
  'style-src': ["'self'", "'unsafe-inline'"],
  'worker-src': ["'self'"],
};
```

`style-src` allows `'unsafe-inline'` because Svelte transitions and the static inline `style` in
`src/app.html` set the `style` attribute at runtime, which the automatic CSP nonce does not cover.
The mode-watcher theme script is a `<script nonce="%sveltekit.nonce%">` in `src/app.html`, filled in by
`transformPageChunk` in `hooks.server.ts`, so no script hash needs maintaining. `e2e/csp.test.ts` fails on any
violation. See the comments in `csp-directives.mjs` for why each entry exists before changing it.

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
