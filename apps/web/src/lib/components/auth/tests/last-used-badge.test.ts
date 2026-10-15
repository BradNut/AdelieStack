// @vitest-environment jsdom

import { LoginMethod } from '@adelie/shared';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import LastUsedBadge from '../last-used-badge.svelte';

afterEach(cleanup);

describe('LastUsedBadge', () => {
  it('marks the method the visitor used last time', () => {
    render(LastUsedBadge, { method: LoginMethod.PASSKEY, lastMethod: LoginMethod.PASSKEY });

    expect(screen.getByTestId('last-used-badge').textContent).toBe('Last used');
  });

  it('shows no hint to a first-time visitor', () => {
    render(LastUsedBadge, { method: LoginMethod.PASSWORD, lastMethod: null });

    expect(screen.queryByTestId('last-used-badge')).toBeNull();
  });

  it('shows no hint next to a method that was not the last used', () => {
    render(LastUsedBadge, { method: LoginMethod.GOOGLE, lastMethod: LoginMethod.PASSWORD });

    expect(screen.queryByTestId('last-used-badge')).toBeNull();
  });
});
