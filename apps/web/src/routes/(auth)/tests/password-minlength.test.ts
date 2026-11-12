// @vitest-environment jsdom
import { MIN_PASSWORD_LENGTH } from '@adelie/shared';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/auth-client.ts', () => ({ authClient: {} }));
vi.mock('#lib/client/captcha/config.ts', () => ({ getCaptchaConfig: async () => ({ enabled: false }) }));
vi.mock('mode-watcher', () => ({ mode: { current: 'light' } }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import ChangePasswordPage from '../../(app)/(protected)/settings/password/+page.svelte';
import ResetPage from '../password/reset/+page.svelte';
import SignupPage from '../signup/+page.svelte';

const page = { signUpEnabled: true, socialProviders: [], flash: undefined, authedUser: null };

afterEach(cleanup);

// The browser's own constraint lets password managers generate a long enough password; the shared form schema
// still shows the translated message.
describe('new-password inputs carry the shared minimum as minlength', () => {
  it.each([
    ['sign-up', () => render(SignupPage, { data: page }), ['Password', 'Confirm Password']],
    ['password reset', () => render(ResetPage, { data: { ...page, token: 'link-token', linkError: null } }), ['New password', 'Confirm password']],
    ['change password', () => render(ChangePasswordPage), ['New password', 'Confirm new password']],
  ])('%s', (_path, mount, labels) => {
    mount();
    for (const label of labels) {
      expect(screen.getByLabelText(label).getAttribute('minlength')).toBe(String(MIN_PASSWORD_LENGTH));
    }
  });

  it('leaves the current-password input unconstrained, so existing shorter passwords still sign in', () => {
    render(ChangePasswordPage);
    expect(screen.getByLabelText('Current password').hasAttribute('minlength')).toBe(false);
  });
});
