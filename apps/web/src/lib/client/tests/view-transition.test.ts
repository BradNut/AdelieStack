import type { OnNavigate } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startViewTransition } from '../view-transition';

function createNavigation(complete: Promise<void>): OnNavigate {
  return { complete } as unknown as OnNavigate;
}

describe('startViewTransition', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns undefined when the browser does not support view transitions', () => {
    vi.stubGlobal('document', {});

    expect(startViewTransition(createNavigation(Promise.resolve()))).toBeUndefined();
  });

  it('resolves once the old state is captured and keeps the transition open until navigation completes', async () => {
    let transitionUpdate: Promise<void> | undefined;
    const documentStartViewTransition = vi.fn((update: () => Promise<void>) => {
      transitionUpdate = update();
    });
    vi.stubGlobal('document', { startViewTransition: documentStartViewTransition });

    let completeNavigation: () => void = () => {};
    const complete = new Promise<void>((resolve) => {
      completeNavigation = resolve;
    });

    const result = startViewTransition(createNavigation(complete));

    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
    expect(documentStartViewTransition).toHaveBeenCalledOnce();

    let transitionSettled = false;
    transitionUpdate?.then(() => {
      transitionSettled = true;
    });
    await Promise.resolve();
    expect(transitionSettled).toBe(false);

    completeNavigation();
    await transitionUpdate;
    expect(transitionSettled).toBe(true);
  });

  it('surfaces the rejection to the view transition when navigation is aborted', async () => {
    let transitionUpdate: Promise<void> | undefined;
    vi.stubGlobal('document', {
      startViewTransition: (update: () => Promise<void>) => {
        transitionUpdate = update();
      },
    });
    const aborted = Promise.reject(new Error('navigation aborted'));

    await startViewTransition(createNavigation(aborted));

    await expect(transitionUpdate).rejects.toThrow('navigation aborted');
  });
});
