export const BucketVisibility = {
  PUBLIC: 'public',
  PRIVATE: 'private',
} as const;

export type BucketVisibility = (typeof BucketVisibility)[keyof typeof BucketVisibility];

export const buildBucketName = (projectName: string, environment: string, visibility: BucketVisibility): string =>
  `${projectName}-${visibility}-${environment}`;
