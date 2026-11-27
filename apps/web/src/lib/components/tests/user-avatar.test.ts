// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import UserAvatar from '../user-avatar.svelte';

const USER_ID = '0196f1a2-7c3e-7b5a-9d21-3f4e5a6b7c8d';

afterEach(cleanup);

/** The `src` of the single avatar image a render produced. Unmounts it, so a test can render twice and compare. */
function renderedSrc(user: { id: string; avatar: string | null }): string {
  render(UserAvatar, { props: { user } });
  const src = screen.getByRole('presentation').getAttribute('src') ?? '';
  cleanup();
  return src;
}

describe('UserAvatar', () => {
  it('draws a generated SVG for a user without a stored avatar', () => {
    expect(renderedSrc({ id: USER_ID, avatar: null })).toMatch(/^data:image\/svg\+xml/);
  });

  it('draws the same avatar every time for the same user', () => {
    expect(renderedSrc({ id: USER_ID, avatar: null })).toBe(renderedSrc({ id: USER_ID, avatar: null }));
  });

  it('draws different avatars for different users', () => {
    expect(renderedSrc({ id: USER_ID, avatar: null })).not.toBe(renderedSrc({ id: 'another-user', avatar: null }));
  });

  it('draws a generated SVG when the stored avatar is an empty string', () => {
    expect(renderedSrc({ id: USER_ID, avatar: '' })).toBe(renderedSrc({ id: USER_ID, avatar: null }));
  });

  it('shows a stored avatar as it is', () => {
    const avatar = 'https://images.example.test/avatars/alice.png';
    expect(renderedSrc({ id: USER_ID, avatar })).toBe(avatar);
  });
});
