export const BucketVisibility = {
  PUBLIC: 'public',
  PRIVATE: 'private',
} as const;

export type BucketVisibility = (typeof BucketVisibility)[keyof typeof BucketVisibility];

export const buildBucketName = (projectName: string, environment: string, visibility: BucketVisibility): string =>
  `${projectName}-${visibility}-${environment}`;

/** Whether `bucket` is one of this project's own buckets in `environment`, the only buckets the app writes to. */
export const isProjectBucket = (projectName: string, environment: string, bucket: string): boolean =>
  Object.values(BucketVisibility).some((visibility) => buildBucketName(projectName, environment, visibility) === bucket);
