/** Values of the API's `ENV` switch: `dev` turns on development-only behaviour (pretty logs, query logging, API reference). */
export const AppEnv = {
  DEV: 'dev',
  PROD: 'prod',
} as const;
export type AppEnv = (typeof AppEnv)[keyof typeof AppEnv];

export const APP_ENVS = Object.values(AppEnv) as [AppEnv, ...AppEnv[]];

/** Whether `env` is the production switch. Everything else counts as development. */
export function isProdEnv(env: string | undefined): boolean {
  return env === AppEnv.PROD;
}
