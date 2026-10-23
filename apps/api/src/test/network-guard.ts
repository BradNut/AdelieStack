import { Socket, type SocketConnectOpts } from 'node:net';

/**
 * Network guard for the API unit-test config (installed by `network-guard.setup.ts`): any real network call fails loudly.
 *
 * Unit tests must stub every external provider (HIBP, captcha, mail, ...). `fetch` is replaced with a function
 * that rejects naming the method and URL; tests that `vi.stubGlobal('fetch', ...)` replace it as before and get it
 * back on `vi.unstubAllGlobals()`. TCP connects (node:http, database and Redis clients) throw naming host and port.
 * IPC/unix-socket connections are left alone. The real-Redis config (`vitest.redis.config.ts`) does not load this.
 *
 * Code under test may swallow the thrown error (Better Auth's HIBP check, client reconnect loops), so every blocked
 * call is also recorded; the setup file's `afterEach` calls `assertNoBlockedNetworkCalls()` to fail the offending test.
 */
export const NETWORK_BLOCKED_MESSAGE = 'Real network call blocked in API unit tests (stub it instead)';

function describeFetchTarget(input: Parameters<typeof fetch>[0], init?: RequestInit): string {
  if (input instanceof Request) return `${(init?.method ?? input.method).toUpperCase()} ${input.url}`;
  return `${(init?.method ?? 'GET').toUpperCase()} ${input instanceof URL ? input.href : input}`;
}

const blockedTargets: string[] = [];

/** Builds the error for a blocked call and records the target so a swallowed error still fails the test. */
function recordBlockedCall(target: string): Error {
  blockedTargets.push(target);
  return new Error(`${NETWORK_BLOCKED_MESSAGE}: ${target}`);
}

/** Returns the targets blocked since the last call and clears the record (for tests that trip the guard on purpose). */
export function takeBlockedNetworkCalls(): string[] {
  return blockedTargets.splice(0);
}

/** Throws listing every target blocked since the last check (even if the caller swallowed the error), then clears. */
export function assertNoBlockedNetworkCalls() {
  const targets = takeBlockedNetworkCalls();
  if (targets.length === 0) return;
  throw new Error(`${NETWORK_BLOCKED_MESSAGE}:\n${targets.map((target) => `  - ${target}`).join('\n')}`);
}

async function blockedFetch(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  throw recordBlockedCall(describeFetchTarget(input, init));
}

/** Pulls the connect options out of every `Socket#connect` call shape, including Node's pre-normalized array form. */
function connectOptions(args: unknown[]): Partial<SocketConnectOpts & { host: string; port: number; path: string }> {
  const [first, second] = args;
  if (Array.isArray(first)) return connectOptions(first);
  if (typeof first === 'object' && first !== null) return first;
  if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first))) {
    return { port: Number(first), host: typeof second === 'string' ? second : 'localhost' };
  }
  if (typeof first === 'string') return { path: first };
  return {};
}

export function installNetworkGuard() {
  globalThis.fetch = blockedFetch;

  const realConnect = Socket.prototype.connect;
  Socket.prototype.connect = function guardedConnect(this: Socket, ...args: unknown[]) {
    const options = connectOptions(args);
    if (options.path) return Reflect.apply(realConnect, this, args) as Socket;
    throw recordBlockedCall(`${options.host ?? 'localhost'}:${options.port}`);
  } as typeof Socket.prototype.connect;
}
