# Web Coding Standards

## Svelte 5 Component Structure

### Component Template
```svelte
<script lang="ts">
  // 1. Imports - External packages first, then internal
  import { Button } from '$lib/components/ui/button';
  import { formatDate } from '$lib/utils/format-date';

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
// src/lib/utils/format-date.ts
export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

// ✅ Shared constants
// src/lib/constants/validation.ts
export const MAX_NAME_LENGTH = 100;
export const MIN_PASSWORD_LENGTH = 8;
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
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const actions = {
  default: async ({ request, fetch }) => {
    const data = await request.formData();
    const parsed = schema.safeParse({
      email: data.get('email'),
      password: data.get('password')
    });

    if (!parsed.success) {
      return fail(400, {
        errors: parsed.error.flatten().fieldErrors
      });
    }

    // Process form...
    return { success: true };
  }
};
```

## Load Functions

### Server Load
```typescript
// +page.server.ts
export async function load({ fetch, params, cookies }) {
  // Has access to server-side APIs
  const session = cookies.get('session');

  const response = await fetch(`/api/puzzles/${params.id}`, {
    headers: { cookie: `session=${session}` }
  });

  if (!response.ok) {
    throw error(404, 'Puzzle not found');
  }

  return {
    puzzle: await response.json()
  };
}
```

### Universal Load
```typescript
// +page.ts
export async function load({ fetch, params }) {
  // Runs on both server and client
  const response = await fetch(`/api/puzzles/${params.id}`);

  return {
    puzzle: await response.json()
  };
}
```

## Error Handling

### Error Pages
```svelte
<!-- +error.svelte -->
<script>
  import { page } from '$app/stores';
</script>

<div class="flex min-h-screen items-center justify-center">
  <div class="text-center">
    <h1 class="text-4xl font-bold">{$page.status}</h1>
    <p class="text-gray-600">{$page.error?.message}</p>
  </div>
</div>
```

### Try-Catch in Load
```typescript
export async function load({ fetch }) {
  try {
    const response = await fetch('/api/data');
    return { data: await response.json() };
  } catch (err) {
    throw error(500, 'Failed to load data');
  }
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
  aria-label="Search puzzles"
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
