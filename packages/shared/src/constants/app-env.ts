/** Values of the API's `ENV` switch: `dev` turns on development-only behaviour (pretty logs, query logging, the auth API reference). */
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

/** Values of `ENVIRONMENT`: where the app is deployed. It also names the storage buckets. */
export const DeployEnvironment = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
} as const;
export type DeployEnvironment = (typeof DeployEnvironment)[keyof typeof DeployEnvironment];

export const DEPLOY_ENVIRONMENTS = Object.values(DeployEnvironment) as [DeployEnvironment, ...DeployEnvironment[]];

/** Values of `NODE_ENV`: how the app was built and is run. The container images set `production`. */
export const NodeEnv = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
} as const;
export type NodeEnv = (typeof NodeEnv)[keyof typeof NodeEnv];

export const NODE_ENVS = Object.values(NodeEnv) as [NodeEnv, ...NodeEnv[]];

/** The two settings that together say whether this is a developer's own machine. */
export interface LocalDevEnvs {
  ENVIRONMENT: DeployEnvironment;
  NODE_ENV: NodeEnv;
}

/**
 * Whether this is explicitly local development: a development environment that is not a production build. Stricter
 * than {@link isProdEnv}, for behaviour that must never reach a deploy, such as showing a client an error's internals.
 * Both settings default to development, so a deploy that keeps the `ENVIRONMENT` default is still caught by the image's
 * `NODE_ENV=production`; `ENV` is not consulted, since its `dev` default says nothing about where the app runs.
 */
export function isLocalDevEnv({ ENVIRONMENT, NODE_ENV }: LocalDevEnvs): boolean {
  return ENVIRONMENT === DeployEnvironment.DEVELOPMENT && NODE_ENV === NodeEnv.DEVELOPMENT;
}

/** The three settings that between them say which environment the app runs in. */
export interface EnvironmentSettings extends LocalDevEnvs {
  ENV: AppEnv;
}

/**
 * Whether any setting declares production: `ENV=prod`, or a deploy's `NODE_ENV` or `ENVIRONMENT` set to production.
 * The image sets only `NODE_ENV=production` while `ENV` defaults to `dev`, so {@link isProdEnv} alone would miss it.
 * Accepts unvalidated strings too (a script reading `process.env`): only an exact production value counts.
 */
export function declaresProduction({ ENV, ENVIRONMENT, NODE_ENV }: Partial<Record<keyof EnvironmentSettings, string>>): boolean {
  return isProdEnv(ENV) || NODE_ENV === NodeEnv.PRODUCTION || ENVIRONMENT === DeployEnvironment.PRODUCTION;
}
