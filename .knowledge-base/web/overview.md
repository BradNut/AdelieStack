# Web Application Overview

## Purpose

`@adelie/web` is a SvelteKit-based frontend for AdelieStack, a generic authentication and account
settings starter. It provides sign-up/login (including Google OAuth), password reset, and a
settings area for managing profile, email, password, and account deletion.

## Technology Stack

### Core Framework
- **SvelteKit 2.x** - Full-stack framework with SSR and SSG
- **Svelte 5** - Reactive UI framework with runes
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server

### UI & Styling
- **Tailwind CSS v4** - Utility-first CSS framework
- **Shadcn/UI** - Accessible component library
- **Lucide Icons** - Icon library
- **Embla Carousel** - Carousel component

### Data & State
- **Svelte Runes** - Reactive state management ($state, $derived, $effect)
- **SvelteKit Stores** - Global state management
- **Form Actions** - Server-side form handling
- **Load Functions** - Data fetching

### Development Tools
- **Vitest** - Testing framework
- **Playwright** - E2E testing
- **Biome** - Linting and formatting
- **Paraglide** - Internationalization

## Architecture Principles

1. **Server-Side Rendering (SSR)** - Fast initial page loads and SEO
2. **Progressive Enhancement** - Works without JavaScript
3. **Type Safety** - Comprehensive TypeScript usage
4. **Component Reusability** - Shared UI components
5. **Accessibility First** - WCAG 2.1 AA compliance
6. **Mobile Responsive** - Mobile-first design

## Application Structure

```
src/
├── routes/
│   ├── (app)/
│   │   ├── (public)/
│   │   │   ├── privacy-policy/     # +page.svelte
│   │   │   └── terms/              # +page.svelte
│   │   ├── (protected)/
│   │   │   └── settings/           # +layout.svelte, +page.svelte, +page.server.ts
│   │   │       └── account/        # +page.svelte, +page.server.ts
│   │   └── +page.svelte            # root app page
│   ├── (auth)/
│   │   ├── login/                  # +page.svelte, +page.server.ts, google/+server.ts
│   │   ├── signup/                 # +page.svelte, +page.server.ts
│   │   ├── password/reset/         # +page.svelte, +page.server.ts
│   │   └── auth/callback/google/   # +server.ts
│   └── api/
│       └── [...slug]/+server.ts    # API proxy route
├── lib/
│   ├── client/          # browser-only code
│   ├── components/      # Reusable UI components
│   │   └── ui/          # Shadcn components
│   ├── hooks/           # Svelte hooks
│   ├── paraglide/       # generated i18n messages/runtime
│   ├── server/          # server-only code
│   ├── utils/           # shared utilities (incl. utils/api.ts: honoClient, parseApiResponse)
│   ├── i18n.ts
│   └── utils.ts
└── app.html              # HTML template
```

## Key Features

### Public Features
- **Root page** (`/`) - Landing page
- **Privacy Policy** and **Terms** - Static informational pages
- **Authentication** - Login (incl. Google OAuth), signup, password reset

### Authenticated Features
- **Settings** - Update profile, update email, update password
- **Account** - Delete account

## Deployment

- **Deployment Platform**: Coolify
- **Build Strategy**: Monorepo with Turbo
- **Adapter**: `@sveltejs/adapter-node` for Node.js deployment
- **Environment**: Containerized with Docker

See [Deployment runbook](./runbooks/deployment.md) for the production URL, build steps, and
rollback procedure.

## Performance Optimizations

- **Code Splitting** - Lazy load routes and components
- **Image Optimization** - Responsive images with lazy loading
- **Minimal JavaScript** - Leverage SSR and progressive enhancement
- **Caching Strategy** - Cache static assets and API responses
- **Prerendering** - Static pages pre-rendered at build time

## Security Features

- **CSRF Protection** - Token-based CSRF prevention
- **XSS Prevention** - Content Security Policy headers
- **Secure Cookies** - HttpOnly, Secure, SameSite cookies
- **Input Validation** - Client and server-side validation
- **Rate Limiting** - Prevent abuse via API proxy

## Integration with API

- **API Proxy** - `/api/[...slug]` proxies browser-side requests to the backend API
- **Session Sharing** - Shared session cookies
- **Type-Safe Contracts** - `@adelie/api-contract` package
- **Error Handling** - Unified error responses via `parseApiResponse`

## Related Documentation

- [Core Principles](./core-principles.md)
- [Platform Architecture](./platform-architecture.md)
- [Features Index](./index.md#features)
