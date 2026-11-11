// @vitest-environment jsdom
import { AppRoute, AuthErrorCode, StatusCodes } from '@adelie/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authPath, stubFetch } from '#lib/client/tests/fetch-stub.ts';

vi.mock('#lib/client/auth-form.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/client/auth-form.ts')>()),
  refreshSession: vi.fn(),
}));
vi.mock('mode-watcher', () => ({ mode: { current: 'light' } }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { refreshSession } from '#lib/client/auth-form.ts';
import * as m from '#lib/paraglide/messages.js';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import LoginPage from '../login/+page.svelte';
import SignupPage from '../signup/+page.svelte';

const EMAIL = 'penguin@example.com';
const PASSWORD = 'correct horse battery';
const pageData = { signUpEnabled: true, flash: undefined, authedUser: null, socialProviders: [] };

let network: ReturnType<typeof stubFetch>;

async function type(label: RegExp | string, value: string) {
  await fireEvent.input(screen.getAllByLabelText(label)[0] as HTMLElement, { target: { value } });
}

async function signIn() {
  render(LoginPage, { data: pageData });
  await type('Email', EMAIL);
  await type('Password', PASSWORD);
  await fireEvent.click(screen.getByRole('button', { name: 'Login' }));
}

async function signUp() {
  render(SignupPage, { data: pageData });
  await type('Name', 'Penguin');
  await type('Email', EMAIL);
  await type(/^Password$/, PASSWORD);
  await type('Confirm Password', PASSWORD);
  await fireEvent.click(screen.getByRole('button', { name: 'Signup' }));
}

beforeEach(() => {
  network = stubFetch();
  vi.mocked(goto).mockReset();
  vi.mocked(refreshSession).mockReset();
  page.url = new URL(`http://localhost${AppRoute.LOGIN}`);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('login page, for an account whose email is not verified', () => {
  beforeEach(() => {
    network.reply(authPath('/sign-in/email'), {
      status: StatusCodes.FORBIDDEN,
      body: { code: AuthErrorCode.EMAIL_NOT_VERIFIED, message: 'Email not verified' },
    });
  });

  it('says to verify the email and stays signed out', async () => {
    await signIn();

    expect(await screen.findByText(m.auth_email_not_verified())).toBeTruthy();
    expect(goto).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('offers to resend the verification email to the address entered', async () => {
    await signIn();

    await fireEvent.click(await screen.findByTestId('resend-verification'));

    await waitFor(() => expect(network.sent(authPath('/send-verification-email'))).toHaveLength(1));
    expect(network.sent(authPath('/send-verification-email'))[0].body).toMatchObject({ email: EMAIL });
  });
});

describe('login page, for any other refusal', () => {
  it('offers no resend', async () => {
    network.reply(authPath('/sign-in/email'), {
      status: StatusCodes.UNAUTHORIZED,
      body: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
    });

    await signIn();

    await waitFor(() => expect(network.sent(authPath('/sign-in/email'))).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText(m.auth_email_not_verified())).toBeNull());
    expect(screen.queryByTestId('resend-verification')).toBeNull();
  });
});

describe('sign-up page, once sign-up is accepted', () => {
  it('asks to check the email instead of signing in', async () => {
    await signUp();

    expect(await screen.findByTestId('signup-check-email')).toBeTruthy();
    expect(screen.getByText(m.signup_check_email_body({ email: EMAIL }))).toBeTruthy();
    expect(screen.getByRole('link', { name: m.signup_check_email_sign_in() }).getAttribute('href')).toBe(AppRoute.LOGIN);
    expect(goto).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
