// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OutsideFieldHost from './form-outside-field-host.svelte';
import FormTestHost from './form-test-host.svelte';

afterEach(cleanup);

async function submitInvalidEmail() {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Ada');
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'nope');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  return user;
}

describe('Form field components', () => {
  it('associates the label with the control and starts without errors', () => {
    render(FormTestHost);
    flushSync();
    const input = screen.getByRole('textbox', { name: 'Email' });

    expect(input.getAttribute('name')).toBe('email');
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('describes the control by its description, then also by the error once invalid', async () => {
    render(FormTestHost);
    const input = screen.getByRole('textbox', { name: 'Email' });
    const description = screen.getByText('We never share it.');
    flushSync();
    expect(input.getAttribute('aria-describedby')).toBe(description.id);

    await submitInvalidEmail();
    const message = await screen.findByText('Enter a valid email');
    const errors = message.closest('[data-slot="form-field-errors"]');
    expect(input.getAttribute('aria-describedby')).toBe(`${description.id} ${errors?.id}`);
  });

  it('shows the error and marks the control and label invalid', async () => {
    render(FormTestHost);
    await submitInvalidEmail();

    const message = await screen.findByText('Enter a valid email');
    expect(message.className).toContain('custom-error');
    expect(screen.getByRole('textbox', { name: 'Email' }).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Email').hasAttribute('data-invalid')).toBe(true);
  });

  it('keeps other fields clean and clears the error once the value is valid', async () => {
    render(FormTestHost);
    const user = await submitInvalidEmail();
    await screen.findByText('Enter a valid email');

    expect(screen.getByRole('textbox', { name: 'Name' }).getAttribute('aria-invalid')).toBeNull();

    const email = screen.getByRole('textbox', { name: 'Email' });
    await user.clear(email);
    await user.type(email, 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByText('Enter a valid email')).toBeNull());
    expect(email.getAttribute('aria-invalid')).toBeNull();
  });

  it('renders errors through a custom children snippet', async () => {
    render(FormTestHost);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Custom: Name required')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Name' }).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('textbox', { name: 'Email' }).getAttribute('aria-invalid')).toBeNull();
  });

  it('throws a clear error when used outside Form.Field', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(OutsideFieldHost)).toThrow('must be used inside Form.Field');
  });
});
