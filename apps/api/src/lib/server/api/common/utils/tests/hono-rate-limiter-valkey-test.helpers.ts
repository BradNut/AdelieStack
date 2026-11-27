export const PATH = '/limited';
export const LIMIT = 2;
/** One minute, written out so a wrong conversion or a dropped window fails where it is asserted. */
export const WINDOW_MS = 60_000;

type LimitedApp = { request: (path: string) => Response | Promise<Response> };

/**
 * Just enough Valkey for the Lua scripts `RedisStore` runs, identified by the commands they contain.
 * Not the shared `createValkeyServiceMock()`: its `client.call` resolves `null`, so `RedisStore` can't run on it.
 */
export function createFakeValkey() {
  const hits = new Map<string, number>();
  const valkey = {
    commands: [] as string[],
    /** While set, every command is refused, as when Valkey is unreachable. */
    down: false,
    /** Refuses to load the scripts it matches. */
    refuseScript: (_script: string): boolean => false,
    scriptLoads: () => valkey.commands.filter((command) => command === 'SCRIPT').length,
    async call(command: string, ...args: (string | number)[]): Promise<unknown> {
      valkey.commands.push(command);
      if (valkey.down) throw new Error('connect ECONNREFUSED valkey');
      if (command === 'SCRIPT') {
        if (valkey.refuseScript(String(args[1]))) throw new Error('script refused');
        return args[1];
      }
      if (command === 'DEL') return hits.delete(String(args[0])) ? 1 : 0;
      if (command !== 'EVALSHA') throw new Error(`Unexpected Valkey command ${command}`);

      const script = String(args[0]);
      const key = String(args[2]);
      if (script.includes('INCR')) hits.set(key, (hits.get(key) ?? 0) + 1);
      return [hits.get(key) ?? false, WINDOW_MS];
    },
  };
  return valkey;
}

export type FakeValkey = ReturnType<typeof createFakeValkey>;

/** Statuses of one request more than `LIMIT` allows, sent one after another. */
export async function requestPastLimit(app: LimitedApp): Promise<number[]> {
  const statuses = [];
  for (let request = 0; request <= LIMIT; request++) statuses.push((await app.request(PATH)).status);
  return statuses;
}

export async function requestWhileValkeyDown(valkey: FakeValkey, app: LimitedApp): Promise<Response> {
  valkey.down = true;
  const response = await app.request(PATH);
  valkey.down = false;
  return response;
}
