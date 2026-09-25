# Web Coding Standards

## Svelte 5 Component Structure

### Component Template
```svelte
<script lang="ts">
  // 1. Imports - External packages first, then internal
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';

  // 2. Type definitions
  interface Props {
    title: string;
    count?: number;
    onUpdate?: (value: number) => void;
  }

  // 3. Props destructuring
  let {
    title,
    count = 0,
    onUpdate
  }: Props = $props();

  // 4. State (reactive variables)
  let isExpanded = $state(false);
  let items = $state<string[]>([]);

  // 5. Derived state (computed values)
  let doubled = $derived(count * 2);
  let isEmpty = $derived(items.length === 0);

  // 6. Effects (side effects and lifecycle)
  $effect(() => {
    console.log('Count changed:', count);
  });

  $effect(() => {
    // Cleanup function
    const timer = setInterval(() => {
      console.log('Tick');
    }, 1000);

    return () => clearInterval(timer);
  });

  // 7. Event handlers and functions
  function handleClick() {
    isExpanded = !isExpanded;
    onUpdate?.(count + 1);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleClick();
    }
  }
</script>

<!-- 8. Markup -->
<div class="container">
  <h1>{title}</h1>

  {#if isExpanded}
    <p>Count: {count}, Doubled: {doubled}</p>
  {/if}

  <Button onclick={handleClick}>
    Toggle
  </Button>
</div>

<!-- 9. Scoped styles (only if necessary) -->
<style>
  .container {
    /* Prefer Tailwind classes over custom CSS */
  }
</style>
```

## TypeScript Guidelines

### Props Interface
```typescript
// ✅ Preferred: Explicit interface
interface UserCardProps {
  user: User;
  isEditable?: boolean;
  onSave?: (user: User) => void;
}

let { user, isEditable = false, onSave }: UserCardProps = $props();

// ❌ Avoid: Inline types
let { user, isEditable }: { user: User; isEditable?: boolean } = $props();
```

### State Typing
```typescript
// ✅ Explicit types for complex state
let users = $state<User[]>([]);
let selectedUser = $state<User | null>(null);

// ✅ Type inference for simple state
let count = $state(0); // inferred as number
let name = $state(''); // inferred as string
```

### Event Handlers
```typescript
// ✅ Typed event handlers
function handleSubmit(event: SubmitEvent) {
  event.preventDefault();
  // ...
}

function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
  const value = event.currentTarget.value;
  // ...
}
```

## Svelte Runes Best Practices

### $state
```typescript
// ✅ Use for reactive local state
let count = $state(0);
let user = $state({ name: 'John', age: 30 });

// ✅ Use $state.raw for non-reactive objects
let config = $state.raw({ apiUrl: 'https://api.example.com' });

// ❌ Avoid: Unnecessary reactivity
let PI = $state(3.14159); // Should be const PI = 3.14159
```

### $derived
```typescript
// ✅ Use for computed values
let doubled = $derived(count * 2);
let fullName = $derived(`${firstName} ${lastName}`);
let isValid = $derived(email.includes('@') && password.length >= 8);

// ❌ Avoid: Side effects in $derived
let invalid = $derived(() => {
  console.log('Computing...'); // Side effect!
  return count * 2;
});
```

### $effect
```typescript
// ✅ Use for side effects
$effect(() => {
  document.title = `Count: ${count}`;
});

// ✅ Cleanup function
$effect(() => {
  const subscription = subscribe(data => {
    items = data;
  });

  return () => subscription.unsubscribe();
});

// ❌ Avoid: Updating state in $effect without care
$effect(() => {
  // Can cause infinite loop if not careful
  count = count + 1;
});
```

### $props
```typescript
// ✅ Destructure with defaults
let { title, count = 0, onUpdate }: Props = $props();

// ✅ Use $bindable for two-way binding
interface Props {
  value: string;
}

let { value = $bindable() }: Props = $props();
```

## Server/Client Boundaries

### Server-Only Code
```typescript
// ✅ Server-only imports
// src/lib/server/db.ts
import { drizzle } from 'drizzle-orm/node-postgres';

export const db = drizzle(process.env.DATABASE_URL);

// ❌ Never import server code in components
// +page.svelte
import { db } from '$lib/server/db'; // ERROR!
```

### Shared Code
```typescript
// ✅ Shared utilities (no server dependencies)
// src/lib/utils/helpers.ts
export function ciEquals(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;
}

// ✅ Shared constants — reuse from @adelie/shared before adding new literals
import { MAX_NAME_LENGTH, MIN_PASSWORD_LENGTH } from '@adelie/shared';
```

### Client-Only Code
```typescript
// ✅ Client-only code
// src/lib/client/analytics.ts
export function trackEvent(name: string) {
  if (typeof window !== 'undefined') {
    // Analytics code
  }
}
```

## Styling Guidelines

### Tailwind CSS
```svelte
<!-- ✅ Use Tailwind utility classes -->
<div class="flex items-center gap-4 p-4 bg-white rounded-lg shadow-md">
  <h2 class="text-2xl font-bold text-gray-900">Title</h2>
</div>

<!-- ✅ Use cn() for conditional classes -->
<script>
  import { cn } from '$lib/utils';
  let isActive = $state(false);
</script>

<button class={cn(
  'px-4 py-2 rounded',
  isActive ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
)}>
  Toggle
</button>

<!-- ❌ Avoid: Inline styles -->
<div style="padding: 16px; background: white;">
  Content
</div>
```

### Shadcn Components
```svelte
<script>
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
</script>

<div class="space-y-4">
  <div>
    <Label for="email">Email</Label>
    <Input id="email" type="email" placeholder="you@example.com" />
  </div>

  <Button type="submit">Submit</Button>
</div>
```

## Form Handling

### Progressive Enhancement
```svelte
<script>
  import { enhance } from '$app/forms';

  let loading = $state(false);
</script>

<!-- Works without JavaScript -->
<form
  method="POST"
  use:enhance={() => {
    loading = true;

    return async ({ result, update }) => {
      loading = false;
      await update();
    };
  }}
>
  <input name="email" type="email" required />
  <button type="submit" disabled={loading}>
    {loading ? 'Submitting...' : 'Submit'}
  </button>
</form>
```

### Form Actions
```typescript
// +page.server.ts
import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { setError, superValidate } from 'sveltekit-superforms/server';
import { StatusCodes, updateEmailDto } from '@adelie/shared';
import { honoClient, parseApiResponse } from '$lib/utils/api';

export const actions = {
  updateEmail: async ({ request, fetch }) => {
    const updateEmailForm = await superValidate(request, zod4(updateEmailDto));

    if (!updateEmailForm.valid) {
      return fail(StatusCodes.BAD_REQUEST, { updateEmailForm });
    }

    const { error } = await parseApiResponse(
      await honoClient(fetch).users.me.email.request.$post({ json: updateEmailForm.data })
    );

    if (error) {
      return setError(updateEmailForm, 'email', 'Unable to update email.');
    }

    return { updateEmailForm };
  }
};
```

See [Data Fetching](./data-fetching.md) — `honoClient`/`parseApiResponse` from `$lib/utils/api.ts`
is the standard way to call the API from `load`/actions; branch on `error`/`status`, since
`parseApiResponse` never throws for non-2xx responses.

## Load Functions

### Server Load
```typescript
// +page.server.ts
import { error } from '@sveltejs/kit';
import { honoClient, parseApiResponse } from '$lib/utils/api';

export async function load({ fetch }) {
  // Has access to server-side APIs and SvelteKit's cookie-aware fetch
  const { data, error: apiError, status } = await parseApiResponse(
    await honoClient(fetch).users.me.$get()
  );

  if (apiError) {
    error(status, 'Unable to load account');
  }

  return {
    user: data
  };
}
```

### Universal Load
```typescript
// +page.ts
import { honoClient, parseApiResponse } from '$lib/utils/api';

export async function load({ fetch }) {
  // Runs on both server and client
  const { data } = await parseApiResponse(await honoClient(fetch).users.me.$get());

  return {
    user: data
  };
}
```

## Error Handling

### Error Pages
```svelte
<!-- +error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="flex min-h-screen items-center justify-center">
  <div class="text-center">
    <h1 class="text-4xl font-bold">{page.status}</h1>
    <p class="text-gray-600">{page.error?.message}</p>
  </div>
</div>
```

`$app/state` is the current SvelteKit (2.12+) convention — `page` is a runed object (read its
fields directly, no `$` prefix), unlike the deprecated `$app/stores` reactive store.

### Error Branching in Load
```typescript
import { error } from '@sveltejs/kit';
import { honoClient, parseApiResponse } from '$lib/utils/api';

export async function load({ fetch }) {
  const { data, error: apiError, status } = await parseApiResponse(await honoClient(fetch).users.me.$get());

  if (apiError) {
    error(status, 'Failed to load data');
  }

  return { data };
}
```

## Testing

### Component Tests
```typescript
import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import UserCard from './user-card.svelte';

describe('UserCard', () => {
  it('renders user name', () => {
    render(UserCard, {
      props: {
        user: { name: 'John Doe', email: 'john@example.com' }
      }
    });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('calls onSave when button clicked', async () => {
    const onSave = vi.fn();
    const { component } = render(UserCard, {
      props: { user: { name: 'John' }, onSave }
    });

    await fireEvent.click(screen.getByRole('button'));
    expect(onSave).toHaveBeenCalled();
  });
});
```

## Accessibility

### Semantic HTML
```svelte
<!-- ✅ Use semantic elements -->
<nav>
  <ul>
    <li><a href="/home">Home</a></li>
  </ul>
</nav>

<main>
  <article>
    <h1>Title</h1>
    <p>Content</p>
  </article>
</main>

<!-- ❌ Avoid: Divs for everything -->
<div class="nav">
  <div class="link">Home</div>
</div>
```

### ARIA Labels
```svelte
<button
  aria-label="Close dialog"
  onclick={close}
>
  <XIcon />
</button>

<input
  type="search"
  aria-label="Search users"
  placeholder="Search..."
/>
```

### Keyboard Navigation
```svelte
<script>
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close();
    }
  }
</script>

<div
  role="dialog"
  tabindex="-1"
  onkeydown={handleKeydown}
>
  <!-- Dialog content -->
</div>
```

## Related Documentation

- [Core Principles](../core-principles.md)
- [Data Fetching](./data-fetching.md)
- [Testing Standards](./testing-standards.md)
