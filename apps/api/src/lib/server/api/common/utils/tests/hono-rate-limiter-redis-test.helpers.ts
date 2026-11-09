export const PATH = '/limited';
export const LIMIT = 2;
/** One minute, written out so a wrong conversion or a dropped window fails where it is asserted. */
export const WINDOW_MS = 60_000;

type LimitedApp = { request: (path: string) => Response | Promise<Response> };

/**
 * Just enough Redis for the Lua scripts `RedisStore` runs, identified by the commands they contain.
 * Not the shared `createRedisServiceMock()`: its `redis.call` resolves `null`, so `RedisStore` can't run on it.
 */
export function createFakeRedis() {
  const hits = new Map<string, number>();
  const redis = {
    commands: [] as string[],
    /** While set, every command is refused, as when Redis is unreachable. */
    down: false,
    /** Refuses to load the scripts it matches. */
    refuseScript: (_script: string): boolean => false,
    scriptLoads: () => redis.commands.filter((command) => command === 'SCRIPT').length,
    async call(command: string, ...args: (string | number)[]): Promise<unknown> {
      redis.commands.push(command);
      if (redis.down) throw new Error('connect ECONNREFUSED redis');
      if (command === 'SCRIPT') {
        if (redis.refuseScript(String(args[1]))) throw new Error('script refused');
        return args[1];
      }
      if (command === 'DEL') return hits.delete(String(args[0])) ? 1 : 0;
      if (command !== 'EVALSHA') throw new Error(`Unexpected Redis command ${command}`);

      const script = String(args[0]);
      const key = String(args[2]);
      if (script.includes('INCR')) hits.set(key, (hits.get(key) ?? 0) + 1);
      return [hits.get(key) ?? false, WINDOW_MS];
    },
  };
  return redis;
}

export type FakeRedis = ReturnType<typeof createFakeRedis>;

/** Statuses of one request more than `LIMIT` allows, sent one after another. */
export async function requestPastLimit(app: LimitedApp): Promise<number[]> {
  const statuses = [];
  for (let request = 0; request <= LIMIT; request++) statuses.push((await app.request(PATH)).status);
  return statuses;
}

export async function requestWhileRedisDown(redis: FakeRedis, app: LimitedApp): Promise<Response> {
  redis.down = true;
  const response = await app.request(PATH);
  redis.down = false;
  return response;
}
