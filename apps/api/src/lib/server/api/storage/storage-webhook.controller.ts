import { createHash, timingSafeEqual } from 'node:crypto';
import { StatusCodes } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import type { Context } from 'hono';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { Controller } from '#lib/server/api/common/factories/controllers.factory';
import { LoggerService } from '#lib/server/api/common/services/logger.service';
import type { HonoEnv } from '#lib/server/api/common/utils/hono';
import { FileScannerWorker, type StorageScanJob } from './file-scanner.worker';
import { BucketVisibility, buildBucketName } from './storage.buckets';

// S3-compatible providers emit object-created events whose name starts with this.
const S3_OBJECT_CREATED_PREFIX = 's3:ObjectCreated:';
// SeaweedFS filer notifications key objects under this path prefix.
const SEAWEEDFS_BUCKET_PREFIX = '/buckets/';
// A provider sends one record per object; a larger batch is cut here so one request cannot queue unbounded scans.
const MAX_RECORDS_PER_REQUEST = 10;
const BEARER_PREFIX = 'Bearer ';

/** Hashing both sides first gives equal-length buffers, so the comparison takes the same time whatever the input. */
const sha256 = (value: string) => createHash('sha256').update(value).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b));

/** A key that is not valid URI encoding names no object we wrote; skip it rather than fail the request. */
function decodeObjectKey(key: string): string | null {
  try {
    return decodeURIComponent(key);
  } catch {
    return null;
  }
}

type S3WebhookEvent = {
  Records?: Array<{
    eventName?: string;
    s3?: {
      bucket?: { name?: string };
      object?: { key?: string };
    };
  }>;
};

type SeaweedFsWebhookEvent = {
  key?: string;
  event_type?: string;
  message?: {
    new_entry?: { name?: string; is_directory?: boolean };
  };
};

function parseSeaweedFsKey(key: string): StorageScanJob | null {
  if (!key.startsWith(SEAWEEDFS_BUCKET_PREFIX)) return null;
  const withoutPrefix = key.slice(SEAWEEDFS_BUCKET_PREFIX.length);
  const slashIndex = withoutPrefix.indexOf('/');
  if (slashIndex === -1) return null;
  const bucket = withoutPrefix.slice(0, slashIndex);
  const objectKey = withoutPrefix.slice(slashIndex + 1);
  if (!bucket || !objectKey) return null;
  return { bucket, key: objectKey };
}

/**
 * Converts a raw storage notification (S3-style or SeaweedFS-style) into the set of
 * objects that should be scanned. Returns an empty array for events we ignore.
 */
export function extractScanJobs(event: unknown): StorageScanJob[] {
  if (typeof event !== 'object' || event === null) return [];

  const s3Event = event as S3WebhookEvent;
  if (Array.isArray(s3Event.Records)) {
    return s3Event.Records.slice(0, MAX_RECORDS_PER_REQUEST).flatMap((record) => {
      if (!record?.eventName?.startsWith(S3_OBJECT_CREATED_PREFIX)) return [];
      const bucket = record.s3?.bucket?.name;
      const rawKey = record.s3?.object?.key;
      if (!bucket || !rawKey) return [];
      const key = decodeObjectKey(rawKey);
      return key ? [{ bucket, key }] : [];
    });
  }

  const seaweed = event as SeaweedFsWebhookEvent;
  if (typeof seaweed.key === 'string' && seaweed.event_type === 'create') {
    if (seaweed.message?.new_entry?.is_directory) return [];
    const job = parseSeaweedFsKey(seaweed.key);
    return job ? [job] : [];
  }

  return [];
}

/**
 * Receives storage object-created notifications and dispatches virus scans. The
 * endpoint acknowledges immediately and scans asynchronously so the storage provider
 * is never kept waiting. A bearer secret (`STORAGE_WEBHOOK_SECRET`, required in production) guards it,
 * and only the project's own buckets are scanned.
 */
@injectable()
export class StorageWebhookController extends Controller {
  constructor(
    private readonly configService = inject(ConfigService),
    private readonly loggerService = inject(LoggerService),
    private readonly fileScannerWorker = inject(FileScannerWorker),
  ) {
    super();
  }

  private isAuthorized(c: Context<HonoEnv>): boolean {
    const secret = this.configService.envs.STORAGE_WEBHOOK_SECRET;
    // Only local development runs without a secret; production refuses to start without one.
    if (!secret) return true;
    return safeEqual(c.req.header('authorization') ?? '', `${BEARER_PREFIX}${secret}`);
  }

  private isProjectBucket(bucket: string): boolean {
    const { PROJECT_NAME, ENVIRONMENT } = this.configService.envs;
    return Object.values(BucketVisibility).some((visibility) => buildBucketName(PROJECT_NAME, ENVIRONMENT, visibility) === bucket);
  }

  routes() {
    return this.controller
      .get('/webhook', (c) => c.json({ status: 'ok' }, StatusCodes.OK))
      .post('/webhook', async (c) => {
        if (!this.isAuthorized(c)) {
          this.loggerService.log.warn('Unauthorized storage webhook request');
          return c.json({ error: 'Unauthorized' }, StatusCodes.UNAUTHORIZED);
        }

        let rawEvent: unknown;
        try {
          rawEvent = await c.req.json();
        } catch {
          return c.json({ error: 'Invalid payload' }, StatusCodes.BAD_REQUEST);
        }

        const jobs = extractScanJobs(rawEvent).filter((job) => this.isProjectBucket(job.bucket));
        if (jobs.length === 0) {
          this.loggerService.log.debug('Storage webhook payload produced no scan jobs');
          return c.json({ success: true, scanned: 0 }, StatusCodes.OK);
        }

        // Acknowledge now; scan in the background so the provider is not blocked.
        this.fileScannerWorker.handleScanJobs(jobs).catch((error) => {
          this.loggerService.log.error({ error }, 'Error handling storage webhook scan jobs');
        });

        return c.json({ success: true, scanned: jobs.length }, StatusCodes.OK);
      });
  }
}
