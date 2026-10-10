import { StatusCodes } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import type { Context } from 'hono';
import { ConfigService } from '../common/configs/config.service';
import { Controller } from '../common/factories/controllers.factory';
import { LoggerService } from '../common/services/logger.service';
import type { HonoEnv } from '../common/utils/hono';
import { FileScannerWorker, type StorageScanJob } from './file-scanner.worker';

// S3-compatible providers emit object-created events whose name starts with this.
const S3_OBJECT_CREATED_PREFIX = 's3:ObjectCreated:';
// SeaweedFS filer notifications key objects under this path prefix.
const SEAWEEDFS_BUCKET_PREFIX = '/buckets/';

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
    return s3Event.Records.flatMap((record) => {
      if (!record.eventName?.startsWith(S3_OBJECT_CREATED_PREFIX)) return [];
      const bucket = record.s3?.bucket?.name;
      const key = record.s3?.object?.key;
      if (!bucket || !key) return [];
      return [{ bucket, key: decodeURIComponent(key) }];
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
 * is never kept waiting. An optional bearer secret (`STORAGE_WEBHOOK_SECRET`) guards it.
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
    if (!secret) return true;
    return c.req.header('authorization') === `Bearer ${secret}`;
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

        const jobs = extractScanJobs(rawEvent);
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
