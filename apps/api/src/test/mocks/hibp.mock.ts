import { createHash } from 'node:crypto';
import { type Mock, vi } from 'vitest';

/** The Have I Been Pwned range endpoint; a lookup appends the first five characters of the password's SHA-1. */
export const HIBP_HOST = 'https://api.pwnedpasswords.com/range/';

/** The uppercase hex SHA-1 HIBP indexes passwords by. */
export const sha1 = (value: string): string => createHash('sha1').update(value).digest('hex').toUpperCase();

/**
 * Stubs global `fetch` with the HIBP range API (no real network): `pwned` passwords are reported with a count, everything
 * else is clean, and `failWith` answers every lookup with that status instead. Any other URL throws. Returns the mock so
 * tests can inspect outbound calls; undo with `vi.unstubAllGlobals()`.
 */
export function mockHibp(pwned: string[] = [], failWith?: number): Mock<(input: string | URL | Request) => Promise<Response>> {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(HIBP_HOST)) throw new Error(`unexpected network call: ${url}`);
    if (failWith) return new Response('nope', { status: failWith });
    const prefix = url.slice(HIBP_HOST.length);
    const lines = pwned
      .map(sha1)
      .filter((hash) => hash.startsWith(prefix))
      .map((hash) => `${hash.slice(5)}:42`);
    return new Response(['0000000000000000000000000000000000A:0', ...lines].join('\r\n'), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
