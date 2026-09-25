import type { ResizeOptions } from 'sharp';
import type { BucketVisibility } from './storage.buckets';

export type StorageClientConfig = {
  host: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
};

export type StorageClientEnv = {
  STORAGE_HOST: string;
  STORAGE_PORT: number;
  STORAGE_SSL: boolean;
  STORAGE_ACCESS_KEY: string;
  STORAGE_SECRET_KEY: string;
};

export type StoredObject = {
  body: Buffer;
  contentType: string | undefined;
};

export type Upload = {
  file: File;
  key?: string;
  resizeOptions?: ResizeOptions;
  visibility?: BucketVisibility;
};
