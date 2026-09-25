# Web Testing Standards

Coverage requirements, negative-test scenarios, and mocking rules are shared across the repo — see [API Testing Standards](../../api/standards/testing-standards.md). This document covers only the Svelte/SvelteKit-specific patterns.

## Testing Stack

- **Unit/component tests**: Vitest, `jsdom` environment for component tests
- **DOM queries**: `@testing-library/svelte` plus `@testing-library/user-event`
- **E2E**: Playwright (`e2e/**`)

## File Organization

```
src/lib/
├── components/
│   └── button/
│       ├── button.svelte
│       └── tests/
│           └── button.test.ts
├── utils/
│   ├── format-date.ts
│   └── tests/
│       └── format-date.test.ts
e2e/
├── mainpage.test.ts
└── fixtures/
```

Co-locate unit tests in a `tests/` subdirectory next to the source. Name files `{name}.test.ts`.

## Unit Tests for `.svelte.ts` Modules

Rune-based state modules are testable without mounting a component.

```typescript
// counter.svelte.ts
export function createCounter(initial = 0) {
  let count = $state(initial);
  return {
    get value() {
      return count;
    },
    increment: () => count++,
    decrement: () => count--,
  };
}
```

```typescript
// tests/counter.svelte.test.ts
import { expect, test } from 'vitest';
import { createCounter } from '../counter.svelte';

test('counter increments', () => {
  const counter = createCounter(0);

  expect(counter.value).toBe(0);

  counter.increment();
  expect(counter.value).toBe(1);
});
```

## Testing Effects

`$effect` requires a reactive root. Use `$effect.root` and always call the returned cleanup.

```typescript
import { flushSync } from 'svelte';
import { expect, test } from 'vitest';

test('effect runs on state change', () => {
  const cleanup = $effect.root(() => {
    let count = $state(0);
    const log: number[] = [];

    $effect(() => {
      log.push(count);
    });

    flushSync();
    expect(log).toEqual([0]);

    count = 1;
    flushSync();
    expect(log).toEqual([0, 1]);
  });

  cleanup();
});
```

## Component Testing

### Low-level API

```typescript
import { flushSync, mount, unmount } from 'svelte';
import { expect, test } from 'vitest';
import Counter from '../Counter.svelte';

test('Counter component', () => {
  const component = mount(Counter, {
    target: document.body,
    props: { initial: 0 },
  });

  expect(document.body.innerHTML).toContain('0');

  document.body.querySelector('button')!.click();
  flushSync();

  expect(document.body.innerHTML).toContain('1');

  unmount(component);
});
```

### Testing Library (preferred)

```typescript
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import Counter from '../Counter.svelte';

test('Counter increments on click', async () => {
  const user = userEvent.setup();
  render(Counter);

  const button = screen.getByRole('button');
  expect(button).toHaveTextContent('0');

  await user.click(button);
  expect(button).toHaveTextContent('1');
});
```

## Testing Bindings and Context

`bind:` props cannot be driven directly from a test. Wrap the component.

```svelte
<!-- tests/TestWrapper.svelte -->
<script lang="ts">
  import ComponentUnderTest from '../ComponentUnderTest.svelte';

  let value = $state('');
</script>

<ComponentUnderTest bind:value />
```

```typescript
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import TestWrapper from './TestWrapper.svelte';

test('two-way binding works', async () => {
  const user = userEvent.setup();
  render(TestWrapper);

  const input = screen.getByRole('textbox');
  await user.type(input, 'hello');

  expect(input).toHaveValue('hello');
});
```

## Svelte-Specific Assertions

- Call `flushSync()` after a state change before asserting on the DOM.
- Unmount components created with `mount()` via `unmount()` to avoid cross-test leakage.
- Prefer role-based queries (`getByRole`) over class or test-id selectors.

## Related Documentation

- [API Testing Standards](../../api/standards/testing-standards.md) — coverage and negative-test requirements
- [Web Coding Standards](./coding-standards.md)
- [Core Principles](../core-principles.md)
