/** Env names whose published development value production refuses; {@link DevelopmentDefault} must cover exactly these. */
export const DEVELOPMENT_DEFAULT_NAMES = ['DATABASE_PASSWORD', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY'] as const;
export type DevelopmentDefaultName = (typeof DEVELOPMENT_DEFAULT_NAMES)[number];

/**
 * Credentials the repo publishes for local development: the defaults in `apps/api/.env.schema`, which match the local
 * Postgres in `docker-compose.yaml` and SeaweedFS in `docker/seaweedfs/s3-config.json`. Anyone can read them, so production
 * refuses to start while any of them is still set.
 */
export const DevelopmentDefault = {
  DATABASE_PASSWORD: 'postgres',
  STORAGE_ACCESS_KEY: 'adelie-local-access-key',
  STORAGE_SECRET_KEY: 'adelie-local-secret-key',
} as const satisfies Record<DevelopmentDefaultName, string>;
