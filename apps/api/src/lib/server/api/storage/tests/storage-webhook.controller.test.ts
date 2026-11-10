import { STORAGE_ROUTE } from '@adelie/shared';
import { Container } from '@needle-di/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { LoggerService } from '#lib/server/api/common/services/logger.service';
import { buildRouteApp } from '#lib/server/api/common/testing/route-test-harness';
import type { AppOpenAPI } from '#lib/server/api/common/utils/hono';
import { FileScannerWorker } from '#lib/server/api/storage/file-scanner.worker';
import { BucketVisibility, buildBucketName } from '#lib/server/api/storage/storage.buckets';
import { extractScanJobs, MAX_RECORDS_PER_REQUEST, StorageWebhookController } from '#lib/server/api/storage/storage-webhook.controller';

const PROJECT_NAME = 'adelie';
const ENVIRONMENT = 'development';
const PUBLIC_BUCKET = buildBucketName(PROJECT_NAME, ENVIRONMENT, BucketVisibility.PUBLIC);
const PRIVATE_BUCKET = buildBucketName(PROJECT_NAME, ENVIRONMENT, BucketVisibility.PRIVATE);
const anyBucket = () => true;

const loggerStub = { log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } } as unknown as LoggerService;

const buildApp = (opts: { secret?: string; handleScanJobs?: () => Promise<void> } = {}) => {
  const handleScanJobs = vi.fn(opts.handleScanJobs ?? (async () => {}));
  const container = new Container();
  container.bind({
    provide: ConfigService,
    useValue: { envs: { STORAGE_WEBHOOK_SECRET: opts.secret, PROJECT_NAME, ENVIRONMENT } } as unknown as ConfigService,
  });
  container.bind({ provide: LoggerService, useValue: loggerStub });
  container.bind({ provide: FileScannerWorker, useValue: { handleScanJobs } as unknown as FileScannerWorker });
  const controller = container.get(StorageWebhookController);
  const app = buildRouteApp(controller.routes() as AppOpenAPI, STORAGE_ROUTE);
  return { app, handleScanJobs };
};

const postEvent = (app: ReturnType<typeof buildApp>['app'], event: unknown, headers: Record<string, string> = {}) =>
  app.request('/storage/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(event),
  });

const createdRecord = (bucket: string, key: string) => ({ eventName: 's3:ObjectCreated:Put', s3: { bucket: { name: bucket }, object: { key } } });

const s3Event = { Records: [createdRecord(PUBLIC_BUCKET, 'images/a%20b.png')] };

describe('StorageWebhookController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acknowledges and dispatches a scan job for an S3 object-created event', async () => {
    const { app, handleScanJobs } = buildApp();

    const res = await postEvent(app, s3Event);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, scanned: 1 });
    // URL-encoded key is decoded before being handed to the scanner.
    expect(handleScanJobs).toHaveBeenCalledWith([{ bucket: PUBLIC_BUCKET, key: 'images/a b.png' }]);
  });

  it('returns 200 with no scan jobs for an ignored event', async () => {
    const { app, handleScanJobs } = buildApp();

    const res = await postEvent(app, { Records: [{ eventName: 's3:ObjectRemoved:Delete' }] });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, scanned: 0 });
    expect(handleScanJobs).not.toHaveBeenCalled();
  });

  it('rejects requests without the configured bearer secret', async () => {
    const { app, handleScanJobs } = buildApp({ secret: 'top-secret' });

    const res = await postEvent(app, s3Event);

    expect(res.status).toBe(401);
    expect(handleScanJobs).not.toHaveBeenCalled();
  });

  it('accepts requests carrying the configured bearer secret', async () => {
    const { app, handleScanJobs } = buildApp({ secret: 'top-secret' });

    const res = await postEvent(app, s3Event, { authorization: 'Bearer top-secret' });

    expect(res.status).toBe(200);
    expect(handleScanJobs).toHaveBeenCalledTimes(1);
  });

  it('rejects a wrong bearer secret', async () => {
    const { app, handleScanJobs } = buildApp({ secret: 'top-secret' });

    const res = await postEvent(app, s3Event, { authorization: 'Bearer top-secreT' });

    expect(res.status).toBe(401);
    expect(handleScanJobs).not.toHaveBeenCalled();
  });

  it('rejects a bearer secret of a different length', async () => {
    const { app, handleScanJobs } = buildApp({ secret: 'top-secret' });

    const res = await postEvent(app, s3Event, { authorization: 'Bearer top-secret-and-more' });

    expect(res.status).toBe(401);
    expect(handleScanJobs).not.toHaveBeenCalled();
  });

  it('rejects the secret sent without the bearer scheme', async () => {
    const { app, handleScanJobs } = buildApp({ secret: 'top-secret' });

    const res = await postEvent(app, s3Event, { authorization: 'top-secret' });

    expect(res.status).toBe(401);
    expect(handleScanJobs).not.toHaveBeenCalled();
  });

  it('ignores events naming a bucket other than the project own', async () => {
    const { app, handleScanJobs } = buildApp();

    const res = await postEvent(app, {
      Records: [
        createdRecord('someone-elses-bucket', 'a.png'),
        createdRecord(buildBucketName(PROJECT_NAME, 'staging', BucketVisibility.PUBLIC), 'b.png'),
        createdRecord(PRIVATE_BUCKET, 'c.png'),
      ],
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, scanned: 1 });
    expect(handleScanJobs).toHaveBeenCalledWith([{ bucket: PRIVATE_BUCKET, key: 'c.png' }]);
  });

  it('ignores a SeaweedFS event for a foreign bucket', async () => {
    const { app, handleScanJobs } = buildApp();

    const res = await postEvent(app, { key: '/buckets/other-public-development/a.png', event_type: 'create' });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, scanned: 0 });
    expect(handleScanJobs).not.toHaveBeenCalled();
  });

  it('handles at most the capped number of records from an oversized batch', async () => {
    const { app, handleScanJobs } = buildApp();
    const records = Array.from({ length: MAX_RECORDS_PER_REQUEST * 2 + 5 }, (_, i) => createdRecord(PUBLIC_BUCKET, `img-${i}.png`));

    const res = await postEvent(app, { Records: records });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, scanned: MAX_RECORDS_PER_REQUEST });
    // The first records up to the cap are handled; the rest are dropped.
    expect(handleScanJobs).toHaveBeenCalledWith(
      Array.from({ length: MAX_RECORDS_PER_REQUEST }, (_, i) => ({ bucket: PUBLIC_BUCKET, key: `img-${i}.png` })),
    );
  });

  it('does not let ignored records use up the cap', async () => {
    const { app, handleScanJobs } = buildApp();
    const ignored = Array.from({ length: MAX_RECORDS_PER_REQUEST }, (_, i) => [
      createdRecord('someone-elses-bucket', `foreign-${i}.png`),
      { eventName: 's3:ObjectRemoved:Delete', s3: { bucket: { name: PUBLIC_BUCKET }, object: { key: `removed-${i}.png` } } },
    ]).flat();

    const res = await postEvent(app, { Records: [...ignored, createdRecord(PUBLIC_BUCKET, 'wanted.png')] });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, scanned: 1 });
    expect(handleScanJobs).toHaveBeenCalledWith([{ bucket: PUBLIC_BUCKET, key: 'wanted.png' }]);
  });

  it('skips a malformed object key and still handles the rest', async () => {
    const { app, handleScanJobs } = buildApp();

    const res = await postEvent(app, {
      Records: [createdRecord(PUBLIC_BUCKET, 'bad%E0%A4%A.png'), createdRecord(PUBLIC_BUCKET, 'good.png')],
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, scanned: 1 });
    expect(handleScanJobs).toHaveBeenCalledWith([{ bucket: PUBLIC_BUCKET, key: 'good.png' }]);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const { app } = buildApp();

    const res = await app.request('/storage/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not-json' });

    expect(res.status).toBe(400);
  });
});

describe('extractScanJobs', () => {
  it('extracts and decodes keys from S3 object-created records', () => {
    expect(extractScanJobs(s3Event, anyBucket)).toEqual([{ bucket: PUBLIC_BUCKET, key: 'images/a b.png' }]);
  });

  it('ignores non-create S3 events', () => {
    expect(extractScanJobs({ Records: [{ ...createdRecord('b', 'k'), eventName: 's3:ObjectRemoved:Delete' }] }, anyBucket)).toEqual([]);
  });

  it('normalizes a SeaweedFS create event into a scan job', () => {
    const event = {
      key: `/buckets/${PUBLIC_BUCKET}/images/photo.png`,
      event_type: 'create',
      message: { new_entry: { name: 'photo.png', is_directory: false } },
    };
    expect(extractScanJobs(event, anyBucket)).toEqual([{ bucket: PUBLIC_BUCKET, key: 'images/photo.png' }]);
  });

  it('ignores SeaweedFS directory and non-create events', () => {
    expect(
      extractScanJobs({ key: '/buckets/b/dir', event_type: 'create', message: { new_entry: { name: 'dir', is_directory: true } } }, anyBucket),
    ).toEqual([]);
    expect(extractScanJobs({ key: '/buckets/b/obj', event_type: 'update' }, anyBucket)).toEqual([]);
  });

  it('skips a record whose key is not valid URI encoding', () => {
    expect(extractScanJobs({ Records: [createdRecord('b', '%')] }, anyBucket)).toEqual([]);
  });

  it('returns no jobs for unknown payloads', () => {
    expect(extractScanJobs(null, anyBucket)).toEqual([]);
    expect(extractScanJobs({}, anyBucket)).toEqual([]);
    expect(extractScanJobs('nope', anyBucket)).toEqual([]);
  });
});
