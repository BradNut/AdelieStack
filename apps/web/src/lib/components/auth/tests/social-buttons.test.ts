// @vitest-environment jsdom

import { SocialProvider } from '@adelie/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SocialButtons from '../social-buttons.svelte';

afterEach(cleanup);

describe('SocialButtons', () => {
  it('renders nothing when no provider is configured', () => {
    render(SocialButtons, { providers: [], onselect: vi.fn() });

    expect(screen.queryByTestId('social-buttons')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders one button per configured provider, by name', () => {
    render(SocialButtons, { providers: [SocialProvider.GITHUB, SocialProvider.GOOGLE], onselect: vi.fn() });

    expect(screen.getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['GitHub', 'Google']);
  });

  it('renders only the configured provider', () => {
    render(SocialButtons, { providers: [SocialProvider.GOOGLE], onselect: vi.fn() });

    expect(screen.queryByRole('button', { name: 'GitHub' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Google' })).toBeTruthy();
  });

  it('reports which provider was chosen', async () => {
    const onselect = vi.fn();
    render(SocialButtons, { providers: [SocialProvider.GITHUB, SocialProvider.GOOGLE], onselect });

    await fireEvent.click(screen.getByRole('button', { name: 'GitHub' }));

    expect(onselect).toHaveBeenCalledExactlyOnceWith(SocialProvider.GITHUB);
  });
});
