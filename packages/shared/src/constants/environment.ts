/**
 * Values of `ENVIRONMENT`, the one switch that says which Environment the app runs in (ADR 0015). It also names the
 * storage buckets and tags Sentry events. Staging and production are the Deployed Environments.
 */
export const Environment = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
} as const;
export type Environment = (typeof Environment)[keyof typeof Environment];

export const ENVIRONMENTS = Object.values(Environment) as [Environment, ...Environment[]];

/**
 * Whether the Environment is exactly `development`: the only one where development-only behaviour (pretty logs, query
 * logging, the API references, error detail, Sentry PII) may run. Every protection is on otherwise, so this accepts
 * unvalidated strings too (a script or Sentry reading `process.env` before validation): unset or unknown fails closed.
 */
export function isDevelopmentEnvironment(environment: string | undefined): boolean {
  return environment === Environment.DEVELOPMENT;
}

/**
 * Values of `NODE_ENV`. Only Node and Better Auth read it; none of the app's own decisions branch on it. A Deployed
 * Environment must run with `production`, which the container images set.
 */
export const NodeEnv = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
} as const;
export type NodeEnv = (typeof NodeEnv)[keyof typeof NodeEnv];

export const NODE_ENVS = Object.values(NodeEnv) as [NodeEnv, ...NodeEnv[]];
