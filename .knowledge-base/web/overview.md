# Web Application Overview

## Purpose

The Second Chance Puzzles web application is a SvelteKit-based frontend that provides an intuitive interface for users to donate puzzles, request puzzles, and manage their accounts. It serves as the primary user-facing application for the platform.

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
├── routes/              # SvelteKit file-based routing
│   ├── (app)/          # Authenticated app routes
│   ├── (auth)/         # Authentication routes
│   └── api/            # API proxy routes
├── lib/
│   ├── components/     # Reusable UI components
│   │   └── ui/        # Shadcn components
│   ├── server/        # Server-only code
│   ├── client/        # Client-only code
│   ├── utils/         # Shared utilities
│   ├── constants/     # Shared constants
│   └── validations/   # Zod schemas
└── app.html           # HTML template
```

## Key Features

### Public Features
- **Home Page** - Platform overview and call-to-action
- **About** - Mission and how it works
- **Browse Puzzles** - Public puzzle catalog
- **Authentication** - Login, signup, password reset

### Authenticated Features
- **User Dashboard** - Overview of donations and requests
- **Donate Puzzles** - Multi-step donation workflow
- **Request Puzzles** - Browse and request available puzzles
- **Profile Management** - Edit profile, change password, MFA setup
- **Donation History** - Track donated puzzles
- **Request History** - Track puzzle requests

### Admin Features
- **Admin Dashboard** - Platform statistics
- **User Management** - Manage user accounts
- **Puzzle Management** - Catalog management
- **Donation Management** - Process donations
- **Request Management** - Fulfill requests

## Deployment

- **Production URL**: `https://secondchancepuzzles.com`
- **Deployment Platform**: Coolify
- **Build Strategy**: Monorepo with Turbo
- **Adapter**: `@sveltejs/adapter-node` for Node.js deployment
- **Environment**: Containerized with Docker

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

- **API Proxy** - `/api/*` routes proxy to backend API
- **Session Sharing** - Shared session cookies
- **Type-Safe Contracts** - `@secondchance/api-contract` package
- **Error Handling** - Unified error responses

## Related Documentation

- [Core Principles](./core-principles.md)
- [Platform Architecture](./platform-architecture.md)
- [Features Index](./index.md#features)
