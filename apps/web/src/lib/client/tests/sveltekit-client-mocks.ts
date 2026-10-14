// Vitest setup: stands in for the SvelteKit client router, which does not exist under Vitest.
// Superforms applies validation errors through `applyAction` and reads them from `$app/state`.
import { afterEach, vi } from 'vitest';
import { resetPageState } from './page-state.svelte';

// Action results published by one test must not reach the forms of the next.
afterEach(resetPageState);

vi.mock('$app/state', async () => {
  const { page, navigating } = await import('./page-state.svelte');
  return { page, navigating, updated: { current: false, check: async () => false } };
});
vi.mock('$app/forms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$app/forms')>()),
  applyAction: async (result: { data?: unknown; status?: number }) => {
    const { publishActionResult } = await import('./page-state.svelte');
    publishActionResult(result);
  },
}));
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
  invalidateAll: vi.fn(),
  beforeNavigate: vi.fn(),
  afterNavigate: vi.fn(),
  onNavigate: vi.fn(),
}));
