// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Superforms applies validation errors through SvelteKit's client router, which does not exist under Vitest.
vi.mock('$app/state', async () => {
  const { page, navigating } = await import('$lib/client/tests/page-state.svelte');
  return { page, navigating, updated: { current: false, check: async () => false } };
});
vi.mock('$app/forms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$app/forms')>()),
  applyAction: async (result: { data?: unknown; status?: number }) => {
    const { publishActionResult } = await import('$lib/client/tests/page-state.svelte');
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

import FormTestHost from './form-test-host.svelte';

afterEach(cleanup);

describe('Form field components', () => {
  it('associates the label with the control and starts without errors', () => {
    render(FormTestHost);
    const input = screen.getByLabelText('Email');

    expect(input.getAttribute('name')).toBe('email');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  it('shows the error, marks the control invalid and describes it by the error', async () => {
    render(FormTestHost);
    await fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'nope' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const message = await screen.findByText('Enter a valid email');
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(message.closest('[data-slot="form-field-errors"]')?.id);
    expect(screen.getByText('Email').hasAttribute('data-fs-error')).toBe(true);
  });

  it('keeps other fields clean and clears the error once the value is valid', async () => {
    render(FormTestHost);
    await fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'nope' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Enter a valid email');

    expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBeNull();

    await fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByText('Enter a valid email')).toBeNull());
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBeNull();
  });
});
