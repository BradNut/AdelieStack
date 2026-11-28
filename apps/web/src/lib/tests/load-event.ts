import { vi } from 'vitest';

type LoadEventOptions = {
  /** Path plus any query string, e.g. `/password/reset?token=abc`. */
  path: string;
  user?: object | null;
  /** What the load's `parent()` resolves to; omitted when the load never calls it. */
  parent?: Record<string, unknown>;
};

/** A server load event stub with spy cookies; pass the load's event type, e.g. `buildLoadEvent<Parameters<typeof load>[0]>(...)`. */
export function buildLoadEvent<TEvent>({ path, user = null, parent }: LoadEventOptions): TEvent {
  const url = new URL(`http://localhost${path}`);
  return {
    locals: { user },
    ...(parent && { parent: async () => parent }),
    cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn(), getAll: vi.fn(() => []) },
    url,
    request: new Request(url),
  } as unknown as TEvent;
}

/** Runs a load expected to throw a redirect and returns it, or `null` when the load resolved. */
export async function catchRedirect(run: () => unknown) {
  try {
    await run();
  } catch (thrown) {
    return thrown as { status: number; location: string };
  }
  return null;
}
