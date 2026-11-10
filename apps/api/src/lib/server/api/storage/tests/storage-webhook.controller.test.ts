import { Container } from '@needle-di/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { LoggerService } from '#lib/server/api/common/services/logger.service';
import { buildRouteApp } from '#lib/server/api/common/testing/route-test-harness';
import type { AppOpenAPI } from '#lib/server/api/common/utils/hono';
import { FileScannerWorker } from '#lib/server/api/storage/file-scanner.worker';
import { extractScanJobs, StorageWebhookController } from '#lib/server/api/storage/storage-webhook.controller';

const loggerStub = { log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } } as unknown as LoggerService;

const buildApp = (opts: { secret?: string; handleScanJobs?: () => Promise<void> } = {}) => {
  const handleScanJobs = vi.fn(opts.handleScanJobs ?? (async () => {}));
  const container = new Container();
  container.bind({
    provide: ConfigService,
    useValue: { envs: { STORAGE_WEBHOOK_SECRET: opts.secret, PROJECT_NAME: 'adelie', ENVIRONMENT: 'development' } } as unknown as ConfigService,
  });
  container.bind({ provide: LoggerService, useValue: loggerStub });
  container.bind({ provide: FileScannerWorker, useValue: { handleScanJobs } as unknown as FileScannerWorker });
  const controller = container.get(StorageWebhookController);
  const app = buildRouteApp(controller.routes() as AppOpenAPI, '/storage');
  return { app, handleScanJobs };
};

const postEvent = (app: ReturnType<typeof buildApp>['app'], event: unknown, headers: Record<string, string> = {}) =>
  app.request('/storage/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(event),
  });

const createdRecord = (bucket: string, key: string) => ({ eventName: 's3:ObjectCreated:Put', s3: { bucket: { name: bucket }, object: { key } } });

const s3Event = {
  Records: [{ eventName: 's3:ObjectCreated:Put', s3: { bucket: { name: 'adelie-public-development' }, object: { key: 'images/a%20b.png' } } }],
};

describe('StorageWebhookController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acknowledges and dispatches a scan job for an S3 object-created event', async () => {
    const { app, handleScanJobs } = buildApp();

    const res = await app.request('/storage/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(s3Event),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, scanned: 1 });
    // URL-encoded key is decoded before being handed to the scanner.
    expect(handleScanJobs).toHaveBeenCalledWith([{ bucket: 'adelie-public-development', key: 'images/a b.png' }]);
  });

  it('returns 200 with no scan jobs for an ignored event', async () => {
    const { app, handleScanJobs } = buildApp();

    const res = await app.request('/storage/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ Records: [{ eventName: 's3:ObjectRemoved:Delete' }] }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, scanned: 0 });
    expect(handleScanJobs).not.toHaveBeenCalled();
  });

  it('rejects requests without the configured bearer secret', async () => {
    const { app, handleScanJobs } = buildApp({ secret: 'top-secret' });

    const res = await app.request('/storage/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(s3Event),
    });

    expect(res.status).toBe(401);
    expect(handleScanJobs).not.toHaveBeenCalled();
  });

  it('accepts requests carrying the configured bearer secret', async () => {
    const { app, handleScanJobs } = buildApp({ secret: 'top-secret' });

    const res = await app.request('/storage/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer top-secret' },
      body: JSON.stringify(s3Event),
    });

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
        createdRecord('adelie-public-staging', 'b.png'),
        createdRecord('adelie-private-development', 'c.png'),
      ],
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, scanned: 1 });
    expect(handleScanJobs).toHaveBeenCalledWith([{ bucket: 'adelie-private-development', key: 'c.png' }]);
  });

  it('ignores a SeaweedFS event for a foreign bucket', async () => {
    const { app, handleScanJobs } = buildApp();

    const res = await postEvent(app, { key: '/buckets/other-public-development/a.png', event_type: 'create' });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, scanned: 0 });
    expect(handleScanJobs).not.toHaveBeenCalled();
  });

  it('handles at most 10 records from an oversized batch', async () => {
    const { app, handleScanJobs } = buildApp();
    const records = Array.from({ length: 25 }, (_, i) => createdRecord('adelie-public-development', `img-${i}.png`));

    const res = await postEvent(app, { Records: records });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, scanned: 10 });
    // The first ten records are handled; the rest are dropped.
    expect(handleScanJobs).toHaveBeenCalledWith(Array.from({ length: 10 }, (_, i) => ({ bucket: 'adelie-public-development', key: `img-${i}.png` })));
  });

  it('skips a malformed object key and still handles the rest', async () => {
    const { app, handleScanJobs } = buildApp();

    const res = await postEvent(app, {
      Records: [createdRecord('adelie-public-development', 'bad%E0%A4%A.png'), createdRecord('adelie-public-development', 'good.png')],
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, scanned: 1 });
    expect(handleScanJobs).toHaveBeenCalledWith([{ bucket: 'adelie-public-development', key: 'good.png' }]);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const { app } = buildApp();

    const res = await app.request('/storage/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });

    expect(res.status).toBe(400);
  });
});

describe('extractScanJobs', () => {
  it('extracts and decodes keys from S3 object-created records', () => {
    expect(extractScanJobs(s3Event)).toEqual([{ bucket: 'adelie-public-development', key: 'images/a b.png' }]);
  });

  it('ignores non-create S3 events', () => {
    expect(extractScanJobs({ Records: [{ eventName: 's3:ObjectRemoved:Delete', s3: { bucket: { name: 'b' }, object: { key: 'k' } } }] })).toEqual([]);
  });

  it('normalizes a SeaweedFS create event into a scan job', () => {
    const event = {
      key: '/buckets/adelie-public-development/images/photo.png',
      event_type: 'create',
      message: { new_entry: { name: 'photo.png', is_directory: false } },
    };
    expect(extractScanJobs(event)).toEqual([{ bucket: 'adelie-public-development', key: 'images/photo.png' }]);
  });

  it('ignores SeaweedFS directory and non-create events', () => {
    expect(extractScanJobs({ key: '/buckets/b/dir', event_type: 'create', message: { new_entry: { name: 'dir', is_directory: true } } })).toEqual([]);
    expect(extractScanJobs({ key: '/buckets/b/obj', event_type: 'update' })).toEqual([]);
  });

  it('skips a record whose key is not valid URI encoding', () => {
    expect(extractScanJobs({ Records: [createdRecord('b', '%')] })).toEqual([]);
  });

  it('returns no jobs for unknown payloads', () => {
    expect(extractScanJobs(null)).toEqual([]);
    expect(extractScanJobs({})).toEqual([]);
    expect(extractScanJobs('nope')).toEqual([]);
  });
});
