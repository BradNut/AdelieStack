// @vitest-environment jsdom
import { AuthCallbackPath, SocialProvider } from '@adelie/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authPath, stubFetch } from '#lib/client/tests/fetch-stub.ts';
import { NOT_FRESH } from '#lib/client/tests/fresh-session-fixtures.ts';

vi.mock('mode-watcher', () => ({ mode: { current: 'light' } }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
// Leaving for the provider is a full-page navigation, which jsdom cannot perform.
const redirectBrowser = vi.hoisted(() => vi.fn());
vi.mock('#lib/client/browser-redirect.ts', () => ({ redirectBrowser }));

import { toast } from 'svelte-sonner';
import { freshSession, ReauthOutcome, withFreshSession } from '#lib/client/fresh-session.svelte.ts';
import {
  PENDING_REAUTH_STORAGE_KEY,
  REPLAY_MAX_AGE_MS,
  ReplayActionKey,
  type ReplayRequest,
  replayPendingReauth,
} from '#lib/client/reauth-replay.svelte.ts';
import { page } from '$app/state';
import ReauthDialog from '../reauth-dialog.svelte';

const USER = { id: 'u1', email: 'a@example.com', twoFactorEnabled: false };
const UNLINK = authPath('/unlink-account');
const LIST_ACCOUNTS = authPath('/list-accounts');
const UNLINK_GITHUB: ReplayRequest = { key: ReplayActionKey.UNLINK_ACCOUNT, args: { accountId: 'acc-gh' } };
const CHANGE_EMAIL = authPath('/change-email');
const NEW_EMAIL = 'emperor@example.com';
const CHANGE_TO_EMPEROR: ReplayRequest = { key: ReplayActionKey.CHANGE_EMAIL, args: { newEmail: NEW_EMAIL } };

let network: ReturnType<typeof stubFetch>;

/** Plays the whole outbound half: a stale call opens the dialog and the user picks GitHub. Leaves the entry in storage. */
async function leaveForProvider(replay?: ReplayRequest) {
  page.data = { socialProviders: [SocialProvider.GITHUB] };
  network.reply(authPath('/get-session'), { body: { user: USER, session: { id: 's1' } } });
  network.reply(LIST_ACCOUNTS, { body: [{ id: 'acc-gh', providerId: 'github' }] });
  network.reply(authPath('/sign-in/social'), { body: { url: 'https://github.com/login/oauth/authorize?state=s', redirect: false } });
  withFreshSession(() => Promise.resolve(NOT_FRESH), replay);
  render(ReauthDialog);
  await fireEvent.click(await screen.findByRole('button', { name: 'Continue with GitHub' }));
  await waitFor(() => expect(redirectBrowser).toHaveBeenCalledOnce());
  // The page unloads; the next page load starts without the dialog or any in-memory state.
  cleanup();
  freshSession.settle(ReauthOutcome.DISMISSED);
  network = stubFetch();
  network.reply(LIST_ACCOUNTS, { body: [{ id: 'acc-gh', providerId: 'github' }] });
}

beforeEach(() => {
  sessionStorage.clear();
  network = stubFetch();
  redirectBrowser.mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.info).mockReset();
  freshSession.settle(ReauthOutcome.DISMISSED);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('returning from the provider', () => {
  it('runs the registered action once and shows its normal success message', async () => {
    await leaveForProvider(UNLINK_GITHUB);

    await replayPendingReauth({ userId: 'u1', providerError: null });

    expect(network.sent(UNLINK).map((request) => request.body)).toEqual([{ accountId: 'acc-gh' }]);
    expect(toast.success).toHaveBeenCalledWith('GitHub unlinked.');
    expect(sessionStorage.getItem(PENDING_REAUTH_STORAGE_KEY)).toBeNull();
  });

  it('does not run the action again on a reload', async () => {
    await leaveForProvider(UNLINK_GITHUB);
    await replayPendingReauth({ userId: 'u1', providerError: null });

    await replayPendingReauth({ userId: 'u1', providerError: null });

    expect(network.sent(UNLINK)).toHaveLength(1);
  });

  it('clears the entry before the action runs, so a crash mid-run cannot replay it', async () => {
    await leaveForProvider(UNLINK_GITHUB);
    let storedDuringRun: string | null = 'unset';
    network.reply(UNLINK, { body: {} });
    vi.mocked(toast.success).mockImplementation(() => {
      storedDuringRun = sessionStorage.getItem(PENDING_REAUTH_STORAGE_KEY);
      return 1;
    });

    await replayPendingReauth({ userId: 'u1', providerError: null });

    expect(storedDuringRun).toBeNull();
  });

  it('shows the action normal error when the replay fails', async () => {
    await leaveForProvider(UNLINK_GITHUB);
    network.reply(UNLINK, { status: 400, body: { message: 'Failed to unlink account' } });

    await replayPendingReauth({ userId: 'u1', providerError: null });

    expect(toast.error).toHaveBeenCalledWith('Failed to unlink account');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('drops the action and shows the provider error instead of running it', async () => {
    await leaveForProvider(UNLINK_GITHUB);

    await replayPendingReauth({ userId: 'u1', providerError: 'Registration is closed.' });

    expect(network.sent(UNLINK)).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith('Registration is closed.');
    expect(sessionStorage.getItem(PENDING_REAUTH_STORAGE_KEY)).toBeNull();
  });

  it('drops the action with an error when the session now belongs to another user', async () => {
    await leaveForProvider(UNLINK_GITHUB);

    await replayPendingReauth({ userId: 'someone-else', providerError: null });

    expect(network.sent(UNLINK)).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith('You signed in as a different account, so the action was not run. Please try again.');
    expect(sessionStorage.getItem(PENDING_REAUTH_STORAGE_KEY)).toBeNull();
  });

  it('drops the action when nobody is signed in on return', async () => {
    await leaveForProvider(UNLINK_GITHUB);

    await replayPendingReauth({ userId: null, providerError: null });

    expect(network.sent(UNLINK)).toEqual([]);
    expect(sessionStorage.getItem(PENDING_REAUTH_STORAGE_KEY)).toBeNull();
  });

  it('drops an action that waited longer than the maximum age, without a message', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await leaveForProvider(UNLINK_GITHUB);
    vi.setSystemTime(Date.now() + REPLAY_MAX_AGE_MS + 1);

    await replayPendingReauth({ userId: 'u1', providerError: null });

    expect(network.sent(UNLINK)).toEqual([]);
    expect(toast.error).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_REAUTH_STORAGE_KEY)).toBeNull();
  });

  it('still replays an action just inside the maximum age', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await leaveForProvider(UNLINK_GITHUB);
    vi.setSystemTime(Date.now() + REPLAY_MAX_AGE_MS - 1);

    await replayPendingReauth({ userId: 'u1', providerError: null });

    expect(network.sent(UNLINK)).toHaveLength(1);
  });

  it('tells the user to try again when the stale call was not replayable', async () => {
    await leaveForProvider();

    await replayPendingReauth({ userId: 'u1', providerError: null });

    expect(toast.info).toHaveBeenCalledWith('You are signed in again. Please try that again.');
    expect(network.sent(UNLINK)).toEqual([]);
    expect(sessionStorage.getItem(PENDING_REAUTH_STORAGE_KEY)).toBeNull();
  });

  it('does nothing when no re-authentication was pending', async () => {
    await replayPendingReauth({ userId: 'u1', providerError: null });

    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(network.sent(UNLINK)).toEqual([]);
  });

  it.each([
    ['not JSON', 'not json'],
    ['an unknown action', JSON.stringify({ action: { key: 'delete-everything', args: {} }, userId: 'u1', at: Date.now() })],
    ['arguments of the wrong shape', JSON.stringify({ action: { key: 'unlink-account', args: { accountId: 42 } }, userId: 'u1', at: Date.now() })],
    ['no timestamp', JSON.stringify({ action: null, userId: 'u1' })],
    ['an email change without an address', JSON.stringify({ action: { key: 'change-email', args: { newEmail: 42 } }, userId: 'u1', at: Date.now() })],
  ])('drops a tampered entry with %s and runs nothing', async (_name, raw) => {
    sessionStorage.setItem(PENDING_REAUTH_STORAGE_KEY, raw);

    await replayPendingReauth({ userId: 'u1', providerError: null });

    expect(network.sent(UNLINK)).toEqual([]);
    expect(network.sent(CHANGE_EMAIL)).toEqual([]);
    expect(toast.info).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_REAUTH_STORAGE_KEY)).toBeNull();
  });

  it('quietly skips an account that is already gone', async () => {
    await leaveForProvider(UNLINK_GITHUB);
    network.reply(LIST_ACCOUNTS, { body: [] });

    await replayPendingReauth({ userId: 'u1', providerError: null });

    expect(network.sent(UNLINK)).toEqual([]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows the normal failure toast when the replayed action throws', async () => {
    await leaveForProvider(UNLINK_GITHUB);
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(replayPendingReauth({ userId: 'u1', providerError: null })).resolves.toBeUndefined();

    expect(toast.error).toHaveBeenCalledExactlyOnceWith('Could not unlink the account.');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('starts a registered email change and tells the user the confirmation is on its way', async () => {
    await leaveForProvider(CHANGE_TO_EMPEROR);
    network.reply(CHANGE_EMAIL, { body: { status: true } });

    await replayPendingReauth({ userId: 'u1', providerError: null });

    expect(network.sent(CHANGE_EMAIL).map((request) => request.body)).toEqual([{ newEmail: NEW_EMAIL, callbackURL: AuthCallbackPath.EMAIL_CHANGED }]);
    expect(toast.info).toHaveBeenCalledExactlyOnceWith(
      `If ${NEW_EMAIL} can be used, we're sending a confirmation link there. It can take a few minutes.`,
    );
    expect(sessionStorage.getItem(PENDING_REAUTH_STORAGE_KEY)).toBeNull();
  });

  it('shows the refusal when the replayed email change is rejected', async () => {
    await leaveForProvider(CHANGE_TO_EMPEROR);
    network.reply(CHANGE_EMAIL, { status: 400, body: { message: 'Email is the same' } });

    await replayPendingReauth({ userId: 'u1', providerError: null });

    expect(toast.error).toHaveBeenCalledExactlyOnceWith('Email is the same');
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('shows the email change failure when the replayed change throws', async () => {
    await leaveForProvider(CHANGE_TO_EMPEROR);
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(replayPendingReauth({ userId: 'u1', providerError: null })).resolves.toBeUndefined();

    expect(toast.error).toHaveBeenCalledExactlyOnceWith('Could not start the email change.');
  });

  it('does not change the email of another user who signed in at the provider', async () => {
    await leaveForProvider(CHANGE_TO_EMPEROR);

    await replayPendingReauth({ userId: 'someone-else', providerError: null });

    expect(network.sent(CHANGE_EMAIL)).toEqual([]);
  });

  it('shows the provider error once even when nothing was pending', async () => {
    await replayPendingReauth({ userId: 'u1', providerError: 'Registration is closed.' });

    expect(toast.error).toHaveBeenCalledExactlyOnceWith('Registration is closed.');
  });

  it('shows the provider error once when the stored entry is unreadable', async () => {
    sessionStorage.setItem(PENDING_REAUTH_STORAGE_KEY, 'not json');

    await replayPendingReauth({ userId: 'u1', providerError: 'Registration is closed.' });

    expect(toast.error).toHaveBeenCalledExactlyOnceWith('Registration is closed.');
    expect(sessionStorage.getItem(PENDING_REAUTH_STORAGE_KEY)).toBeNull();
  });
});
