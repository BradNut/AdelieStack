import type { Readable } from 'node:stream';
import { Container } from '@needle-di/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { LoggerService } from '#lib/server/api/common/services/logger.service';
import { FileScannerWorker } from '#lib/server/api/storage/file-scanner.worker';
import { S3StorageClient } from '#lib/server/api/storage/s3-storage.client';
import { MAX_CONCURRENT_WEBHOOK_SCANS, MAX_PENDING_WEBHOOK_SCANS, MAX_WEBHOOK_SCAN_SIZE_BYTES } from '#lib/server/api/storage/storage.constants';
import { ScanStatus, ScanTag } from '#lib/server/api/storage/storage.types';
import { type ScanResponse, ScanResult, VirusScannerService } from '#lib/server/api/storage/virus-scanner.service';

const loggerStub = { log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } } as unknown as LoggerService;

const envs = {
  STORAGE_HOST: 'localhost',
  STORAGE_PORT: 8333,
  STORAGE_SSL: false,
  STORAGE_ACCESS_KEY: 'key',
  STORAGE_SECRET_KEY: 'secret',
};

const buildWorker = (opts: { enabled?: boolean; scan: ScanResponse }) => {
  const scanStream = vi.fn(async (stream: Readable) => {
    // Drain what the worker hands over, as clamd would.
    for await (const _chunk of stream);
    return opts.scan;
  });
  const container = new Container();
  container.bind({ provide: ConfigService, useValue: { envs } as unknown as ConfigService });
  container.bind({ provide: LoggerService, useValue: loggerStub });
  container.bind({ provide: VirusScannerService, useValue: { isEnabled: opts.enabled ?? true, scanStream } as unknown as VirusScannerService });
  return { worker: container.get(FileScannerWorker), scanStream };
};

/** ISO 8601 basic format, e.g. `20261121T070809Z`. */
const ISO_BASIC_TIMESTAMP = /^\d{8}T\d{6}Z$/;

const JOB = { bucket: 'adelie-public-development', key: 'images/photo.png' };

/** A stored object as storage streams it: `body` as a web stream, reported at `contentLength` (its true length unless given). */
const storedStream = (body: string, contentLength: number | undefined = Buffer.byteLength(body)) => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return { stream, contentType: 'image/png', contentLength };
};

describe('FileScannerWorker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when antivirus is disabled', async () => {
    const getObjectStream = vi.spyOn(S3StorageClient.prototype, 'getObjectStream');
    const { worker, scanStream } = buildWorker({ enabled: false, scan: { result: ScanResult.CLEAN } });

    await worker.handleScanJobs([JOB]);

    expect(scanStream).not.toHaveBeenCalled();
    expect(getObjectStream).not.toHaveBeenCalled();
  });

  it('tags a clean object as scanned and leaves it in place', async () => {
    vi.spyOn(S3StorageClient.prototype, 'getObjectStream').mockResolvedValue(storedStream('ok'));
    const setObjectTagging = vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
    const removeObject = vi.spyOn(S3StorageClient.prototype, 'removeObject').mockResolvedValue();
    const { worker } = buildWorker({ scan: { result: ScanResult.CLEAN } });

    await worker.handleScanJobs([JOB]);

    expect(removeObject).not.toHaveBeenCalled();
    expect(setObjectTagging).toHaveBeenLastCalledWith(JOB.bucket, JOB.key, expect.objectContaining({ [ScanTag.STATUS]: ScanStatus.CLEAN }));
  });

  it('stamps every tag it writes with an ISO basic timestamp', async () => {
    vi.spyOn(S3StorageClient.prototype, 'getObjectStream').mockResolvedValue(storedStream('ok'));
    const setObjectTagging = vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
    const { worker } = buildWorker({ scan: { result: ScanResult.CLEAN } });

    await worker.handleScanJobs([JOB]);

    expect(setObjectTagging).toHaveBeenCalledTimes(2);
    for (const [, , tags] of setObjectTagging.mock.calls) {
      expect(tags[ScanTag.TIMESTAMP]).toMatch(ISO_BASIC_TIMESTAMP);
    }
  });

  it('tags and deletes an infected object', async () => {
    vi.spyOn(S3StorageClient.prototype, 'getObjectStream').mockResolvedValue(storedStream('bad'));
    const setObjectTagging = vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
    const removeObject = vi.spyOn(S3StorageClient.prototype, 'removeObject').mockResolvedValue();
    const { worker } = buildWorker({ scan: { result: ScanResult.INFECTED, viruses: ['Eicar-Test-Signature'] } });

    await worker.handleScanJobs([JOB]);

    expect(setObjectTagging).toHaveBeenLastCalledWith(
      JOB.bucket,
      JOB.key,
      expect.objectContaining({ [ScanTag.STATUS]: ScanStatus.INFECTED, [ScanTag.VIRUSES]: 'Eicar-Test-Signature' }),
    );
    expect(removeObject).toHaveBeenCalledWith(JOB.bucket, JOB.key);
  });

  describe('an object over the scan size cap', () => {
    it('is tagged too-large without being scanned or deleted', async () => {
      const stored = storedStream('x', MAX_WEBHOOK_SCAN_SIZE_BYTES + 1);
      vi.spyOn(S3StorageClient.prototype, 'getObjectStream').mockResolvedValue(stored);
      const setObjectTagging = vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
      const removeObject = vi.spyOn(S3StorageClient.prototype, 'removeObject').mockResolvedValue();
      const { worker, scanStream } = buildWorker({ scan: { result: ScanResult.CLEAN } });

      await worker.handleScanJobs([JOB]);

      expect(scanStream).not.toHaveBeenCalled();
      expect(removeObject).not.toHaveBeenCalled();
      expect(setObjectTagging).toHaveBeenLastCalledWith(JOB.bucket, JOB.key, expect.objectContaining({ [ScanTag.STATUS]: ScanStatus.TOO_LARGE }));
      expect(loggerStub.log.warn).toHaveBeenCalledWith(expect.objectContaining({ bucket: JOB.bucket, key: JOB.key }), expect.any(String));
    });

    it('is not read: its stream is cancelled unread', async () => {
      const stored = storedStream('x', MAX_WEBHOOK_SCAN_SIZE_BYTES + 1);
      const cancel = vi.spyOn(stored.stream, 'cancel');
      vi.spyOn(S3StorageClient.prototype, 'getObjectStream').mockResolvedValue(stored);
      vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
      const { worker } = buildWorker({ scan: { result: ScanResult.CLEAN } });

      await worker.handleScanJobs([JOB]);

      expect(cancel).toHaveBeenCalled();
      expect(stored.stream.locked).toBe(false);
    });

    it('counts an object whose length storage does not report as over the cap', async () => {
      vi.spyOn(S3StorageClient.prototype, 'getObjectStream').mockResolvedValue({ ...storedStream('ok'), contentLength: undefined });
      const setObjectTagging = vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
      const { worker, scanStream } = buildWorker({ scan: { result: ScanResult.CLEAN } });

      await worker.handleScanJobs([JOB]);

      expect(scanStream).not.toHaveBeenCalled();
      expect(setObjectTagging).toHaveBeenLastCalledWith(JOB.bucket, JOB.key, expect.objectContaining({ [ScanTag.STATUS]: ScanStatus.TOO_LARGE }));
    });

    it('scans an object of exactly the cap', async () => {
      vi.spyOn(S3StorageClient.prototype, 'getObjectStream').mockResolvedValue(storedStream('ok', MAX_WEBHOOK_SCAN_SIZE_BYTES));
      const setObjectTagging = vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
      const { worker, scanStream } = buildWorker({ scan: { result: ScanResult.CLEAN } });

      await worker.handleScanJobs([JOB]);

      expect(scanStream).toHaveBeenCalledOnce();
      expect(setObjectTagging).toHaveBeenLastCalledWith(JOB.bucket, JOB.key, expect.objectContaining({ [ScanTag.STATUS]: ScanStatus.CLEAN }));
    });
  });

  describe('when notifications arrive faster than scans finish', () => {
    /** A worker whose scans each wait until the test releases them, so the test sees how many run at once. */
    const blockedWorker = () => {
      const releases: (() => void)[] = [];
      let released = false;
      let running = 0;
      let mostAtOnce = 0;
      const scanStream = vi.fn(async () => {
        running += 1;
        mostAtOnce = Math.max(mostAtOnce, running);
        if (!released) await new Promise<void>((resolve) => releases.push(resolve));
        running -= 1;
        return { result: ScanResult.CLEAN };
      });
      vi.spyOn(S3StorageClient.prototype, 'getObjectStream').mockImplementation(async () => storedStream('ok'));
      vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
      const container = new Container();
      container.bind({ provide: ConfigService, useValue: { envs } as unknown as ConfigService });
      container.bind({ provide: LoggerService, useValue: loggerStub });
      container.bind({ provide: VirusScannerService, useValue: { isEnabled: true, scanStream } as unknown as VirusScannerService });
      /** Lets every waiting scan finish, and every later one finish at once. */
      const releaseAll = () => {
        released = true;
        for (const release of releases.splice(0)) release();
      };
      return { worker: container.get(FileScannerWorker), scanStream, releaseAll, mostAtOnce: () => mostAtOnce, running: () => running };
    };

    const jobs = (count: number, prefix = 'k') => Array.from({ length: count }, (_, i) => ({ bucket: JOB.bucket, key: `${prefix}-${i}` }));

    it(`runs at most ${MAX_CONCURRENT_WEBHOOK_SCANS} scans at once, across notifications, and the rest wait their turn`, async () => {
      const { worker, scanStream, releaseAll, mostAtOnce, running } = blockedWorker();

      const first = worker.handleScanJobs(jobs(MAX_CONCURRENT_WEBHOOK_SCANS, 'a'));
      const second = worker.handleScanJobs(jobs(3, 'b'));
      await vi.waitFor(() => expect(running()).toBe(MAX_CONCURRENT_WEBHOOK_SCANS));

      expect(scanStream).toHaveBeenCalledTimes(MAX_CONCURRENT_WEBHOOK_SCANS);
      releaseAll();
      await Promise.all([first, second]);

      expect(scanStream).toHaveBeenCalledTimes(MAX_CONCURRENT_WEBHOOK_SCANS + 3);
      expect(mostAtOnce()).toBe(MAX_CONCURRENT_WEBHOOK_SCANS);
    });

    it(`refuses a notification that would leave more than ${MAX_PENDING_WEBHOOK_SCANS} scans pending, scanning none of it`, async () => {
      const { worker, scanStream, releaseAll } = blockedWorker();

      const accepted = worker.handleScanJobs(jobs(MAX_PENDING_WEBHOOK_SCANS - 1, 'a'));
      const refused = worker.handleScanJobs(jobs(2, 'b'));

      expect(accepted).not.toBeNull();
      expect(refused).toBeNull();
      releaseAll();
      await accepted;
      expect(scanStream).toHaveBeenCalledTimes(MAX_PENDING_WEBHOOK_SCANS - 1);
    });

    it(`accepts a notification of more than ${MAX_PENDING_WEBHOOK_SCANS} objects when nothing is pending, so a retry of it is not refused forever`, async () => {
      const { worker, scanStream, releaseAll, mostAtOnce, running } = blockedWorker();

      const oversized = worker.handleScanJobs(jobs(MAX_PENDING_WEBHOOK_SCANS + 1, 'big'));
      expect(oversized).not.toBeNull();
      expect(worker.handleScanJobs(jobs(1, 'late'))).toBeNull();
      await vi.waitFor(() => expect(running()).toBe(MAX_CONCURRENT_WEBHOOK_SCANS));
      releaseAll();
      await oversized;

      expect(scanStream).toHaveBeenCalledTimes(MAX_PENDING_WEBHOOK_SCANS + 1);
      expect(mostAtOnce()).toBe(MAX_CONCURRENT_WEBHOOK_SCANS);
    });

    it(`still refuses a notification of more than ${MAX_PENDING_WEBHOOK_SCANS} objects while other scans are pending`, async () => {
      const { worker, releaseAll } = blockedWorker();

      const accepted = worker.handleScanJobs(jobs(1, 'a'));
      expect(worker.handleScanJobs(jobs(MAX_PENDING_WEBHOOK_SCANS + 1, 'big'))).toBeNull();
      releaseAll();
      await accepted;
    });

    it('accepts notifications again once pending scans finish', async () => {
      const { worker, releaseAll } = blockedWorker();

      const full = worker.handleScanJobs(jobs(MAX_PENDING_WEBHOOK_SCANS));
      expect(worker.handleScanJobs(jobs(1, 'late'))).toBeNull();
      releaseAll();
      await full;

      const later = worker.handleScanJobs(jobs(1, 'later'));
      expect(later).not.toBeNull();
      await later;
    });

    it('frees a slot when a scan fails, so later scans still run', async () => {
      vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
      vi.spyOn(S3StorageClient.prototype, 'getObjectStream').mockRejectedValue(new Error('storage down'));
      const { worker } = buildWorker({ scan: { result: ScanResult.CLEAN } });

      await worker.handleScanJobs(jobs(MAX_CONCURRENT_WEBHOOK_SCANS + 1));

      const next = worker.handleScanJobs(jobs(MAX_PENDING_WEBHOOK_SCANS));
      expect(next).not.toBeNull();
      await next;
    });
  });
});
