import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOT_FRESH } from './fresh-session-fixtures.ts';

vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));
const refreshAll = vi.fn();
vi.mock('$app/navigation', () => ({ refreshAll: (...args: unknown[]) => refreshAll(...args) }));

import { freshSession, withFreshSession } from '../fresh-session.svelte';

const ok = { data: { ok: true }, error: null };

beforeEach(() => {
  freshSession.settle('dismissed');
  refreshAll.mockClear();
});

describe('withFreshSession', () => {
  it('returns a successful result without prompting', async () => {
    const action = vi.fn().mockResolvedValue(ok);

    expect(await withFreshSession(action)).toBe(ok);
    expect(freshSession.open).toBe(false);
    expect(action).toHaveBeenCalledOnce();
  });

  it('returns any other error untouched, without prompting', async () => {
    const failed = { data: null, error: { status: 400, code: 'OTHER', message: 'No' } };

    expect(await withFreshSession(vi.fn().mockResolvedValue(failed))).toBe(failed);
    expect(freshSession.open).toBe(false);
  });

  it('opens the prompt on a stale session, retries once confirmed, then refreshes the session', async () => {
    const action = vi.fn().mockResolvedValueOnce(NOT_FRESH).mockResolvedValueOnce(ok);

    const pending = withFreshSession(action);
    await vi.waitFor(() => expect(freshSession.open).toBe(true));
    freshSession.settle('confirmed');

    expect(await pending).toBe(ok);
    expect(action).toHaveBeenCalledTimes(2);
    expect(refreshAll).toHaveBeenCalledOnce();
    expect(freshSession.open).toBe(false);
  });

  it('resolves with the original not-fresh error when the prompt is dismissed, and does not retry', async () => {
    const action = vi.fn().mockResolvedValue(NOT_FRESH);

    const pending = withFreshSession(action);
    await vi.waitFor(() => expect(freshSession.open).toBe(true));
    freshSession.settle('dismissed');

    expect(await pending).toBe(NOT_FRESH);
    expect(action).toHaveBeenCalledOnce();
    expect(refreshAll).not.toHaveBeenCalled();
  });

  it('returns the retry error as is when the retry still fails', async () => {
    const failed = { data: null, error: { status: 500, message: 'Boom' } };
    const action = vi.fn().mockResolvedValueOnce(NOT_FRESH).mockResolvedValueOnce(failed);

    const pending = withFreshSession(action);
    await vi.waitFor(() => expect(freshSession.open).toBe(true));
    freshSession.settle('confirmed');

    expect(await pending).toBe(failed);
    expect(refreshAll).not.toHaveBeenCalled();
  });

  it('shows one prompt for concurrent stale actions and retries each', async () => {
    const first = vi.fn().mockResolvedValueOnce(NOT_FRESH).mockResolvedValueOnce(ok);
    const second = vi.fn().mockResolvedValueOnce(NOT_FRESH).mockResolvedValueOnce(ok);

    const a = withFreshSession(first);
    const b = withFreshSession(second);
    await vi.waitFor(() => expect(first).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(second).toHaveBeenCalledOnce());
    freshSession.settle('confirmed');

    expect(await Promise.all([a, b])).toEqual([ok, ok]);
  });
});
