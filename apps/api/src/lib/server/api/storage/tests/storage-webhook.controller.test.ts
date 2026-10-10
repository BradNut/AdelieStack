import { Container } from '@needle-di/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '../../common/configs/config.service';
import { LoggerService } from '../../common/services/logger.service';
import { buildRouteApp } from '../../common/testing/route-test-harness';
import type { AppOpenAPI } from '../../common/utils/hono';
import { FileScannerWorker } from '../file-scanner.worker';
import { extractScanJobs, StorageWebhookController } from '../storage-webhook.controller';

const loggerStub = { log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } } as unknown as LoggerService;

const buildApp = (opts: { secret?: string; handleScanJobs?: () => Promise<void> } = {}) => {
  const handleScanJobs = vi.fn(opts.handleScanJobs ?? (async () => {}));
  const container = new Container();
  container.bind({ provide: ConfigService, useValue: { envs: { STORAGE_WEBHOOK_SECRET: opts.secret } } as unknown as ConfigService });
  container.bind({ provide: LoggerService, useValue: loggerStub });
  container.bind({ provide: FileScannerWorker, useValue: { handleScanJobs } as unknown as FileScannerWorker });
  const controller = container.get(StorageWebhookController);
  const app = buildRouteApp(controller.routes() as AppOpenAPI, '/storage');
  return { app, handleScanJobs };
};

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

  it('returns no jobs for unknown payloads', () => {
    expect(extractScanJobs(null)).toEqual([]);
    expect(extractScanJobs({})).toEqual([]);
    expect(extractScanJobs('nope')).toEqual([]);
  });
});
