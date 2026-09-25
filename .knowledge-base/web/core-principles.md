# Web Core Principles

## Design Philosophy

### 1. Svelte 5 Runes First
- Use `$state` for reactive state
- Use `$derived` for computed values
- Use `$effect` for side effects and lifecycle
- Use `$props` for component props
- Use `$bindable` for two-way binding

### 2. Type Safety
- TypeScript strict mode enabled
- Prefer interfaces over types
- Avoid enums; use const objects
- Type all component props
- Use Zod for runtime validation

### 3. Server/Client Boundaries
- **Never** import server-only code into client components
- Keep server code in `src/lib/server/**`
- Keep client code in `src/lib/client/**`
- Shared code in `src/lib/shared/**` or `src/lib/utils/**`
- Never expose secrets to client

### 4. Progressive Enhancement
- Forms work without JavaScript
- Use SvelteKit form actions for submissions
- Enhance with client-side validation
- Graceful degradation for older browsers

### 5. Accessibility First
- Semantic HTML elements
- ARIA labels where needed
- Keyboard navigation support
- Screen reader compatibility
- Color contrast compliance (WCAG AA)

### 6. Mobile-First Design
- Design for mobile, enhance for desktop
- Responsive breakpoints (Tailwind)
- Touch-friendly interactions
- Performance on mobile networks

## Code Organization

### Component Structure
```svelte
<script lang="ts">
  // 1. Imports
  import { Button } from '$lib/components/ui/button';

  // 2. Props
  interface Props {
    title: string;
    isActive?: boolean;
  }

  let { title, isActive = false }: Props = $props();

  // 3. State
  let count = $state(0);

  // 4. Derived state
  let doubled = $derived(count * 2);

  // 5. Effects
  $effect(() => {
    console.log('Count changed:', count);
  });

  // 6. Functions
  function handleClick() {
    count++;
  }
</script>

<!-- 7. Markup -->
<div>
  <h1>{title}</h1>
  <p>Count: {count}, Doubled: {doubled}</p>
  <Button onclick={handleClick}>Increment</Button>
</div>

<!-- 8. Styles (scoped) -->
<style>
  div {
    padding: 1rem;
  }
</style>
```

### File Naming
- **Components**: kebab-case (e.g., `user-profile.svelte`)
- **Routes**: SvelteKit conventions (`+page.svelte`, `+layout.svelte`)
- **Utilities**: kebab-case (e.g., `format-date.ts`)
- **Types**: kebab-case (e.g., `user-types.ts`)

## Styling Principles

### Tailwind CSS Usage
- Use utility classes for styling
- Avoid custom CSS unless necessary
- Use `cn()` utility for conditional classes
- Follow mobile-first approach
- Use Tailwind config for theme customization

### Shadcn Components
- Import from `$lib/components/ui`
- Customize via Tailwind classes
- Maintain accessibility features
- Follow component API conventions

### Example
```svelte
<script>
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';

  let isActive = $state(false);
</script>

<Button
  class={cn(
    'w-full',
    isActive && 'bg-primary'
  )}
>
  Click me
</Button>
```

## State Management

### Local Component State
Use `$state` for component-specific state:
```typescript
let count = $state(0);
let user = $state({ name: 'John', age: 30 });
```

### Derived State
Use `$derived` for computed values:
```typescript
let doubled = $derived(count * 2);
let fullName = $derived(`${user.firstName} ${user.lastName}`);
```

### Server State
`event.locals.api` (a `honoClient` wired up in `hooks.server.ts`) is available to every server
`load`/action; there is no global writable store for user/session state. See
[Data Fetching](./standards/data-fetching.md) for the full pattern, including
`honoClient`/`parseApiResponse`.

## Data Fetching

Data fetching goes over Hono RPC via `honoClient`/`parseApiResponse` (`$lib/utils/api.ts`), not
raw `fetch('/api/...')`. Full decision, examples, and the browser-side proxy pattern are
documented in [Data Fetching](./standards/data-fetching.md) — read that file rather than
duplicating examples here.

## Error Handling

### Error Pages
```svelte
<!-- +error.svelte -->
<script>
  import { page } from '$app/stores';
</script>

<h1>{$page.status}</h1>
<p>{$page.error.message}</p>
```

### Form Validation
```svelte
<script>
  import { enhance } from '$app/forms';

  let form = $state(null);
</script>

<form method="POST" use:enhance>
  <input name="email" type="email" required />
  {#if form?.errors?.email}
    <p class="text-red-500">{form.errors.email}</p>
  {/if}
  <button type="submit">Submit</button>
</form>
```

## Performance Principles

### Code Splitting
```typescript
// Lazy load components
const HeavyComponent = lazy(() => import('./HeavyComponent.svelte'));
```

### Image Optimization
```svelte
<img
  src="/images/hero.jpg"
  alt="Hero"
  loading="lazy"
  decoding="async"
  width="800"
  height="600"
/>
```

### Prerendering
```typescript
// +page.ts
export const prerender = true; // Static generation
```

## Testing Principles

### Component Tests
```typescript
import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import UserProfile from './user-profile.svelte';

describe('UserProfile', () => {
  it('renders user name', () => {
    render(UserProfile, { props: { name: 'John' } });
    expect(screen.getByText('John')).toBeInTheDocument();
  });
});
```

### E2E Tests
```typescript
import { test, expect } from '@playwright/test';

test('user can login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="email"]', 'user@example.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
});
```

## Security Principles

### CSRF Protection
- Use SvelteKit's built-in CSRF protection
- Validate form tokens on submission
- Use SameSite cookies

### XSS Prevention
- Svelte automatically escapes content
- Use `{@html}` sparingly and only with sanitized content
- Set Content-Security-Policy headers

### Input Validation
- Validate on both client and server
- Use Zod schemas for validation
- Sanitize user input

## Related Documentation

- [Overview](./overview.md)
- [Coding Standards](./standards/coding-standards.md)
