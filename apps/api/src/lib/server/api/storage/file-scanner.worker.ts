import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { MAX_CONCURRENT_WEBHOOK_SCANS, MAX_PENDING_WEBHOOK_SCANS, MAX_WEBHOOK_SCAN_SIZE_BYTES } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { LoggerService } from '#lib/server/api/common/services/logger.service';
import { S3StorageClientProvider } from './s3-storage.client';
import { ScanStatus, scanTags } from './storage.types';
import { ScanResult, VirusScannerService } from './virus-scanner.service';

/**
 * Normalized object-created notification: a storage object that should be scanned.
 */
export type StorageScanJob = {
  bucket: string;
  key: string;
};

/**
 * Scans objects reported by the storage webhook. This is defense-in-depth that
 * confirms or overturns the upload's verdict after an object lands in storage (including
 * any that bypass the synchronous upload path). Infected objects are tagged and deleted;
 * the outcome is recorded as the object's Scan Status, which `StorageService` reads check
 * before serving it (ADR 0016). A Presigned URL issued earlier is not re-checked.
 *
 * One instance serves every request, so its bounds hold across them: at most `MAX_CONCURRENT_WEBHOOK_SCANS` scans run
 * at once, and at most `MAX_PENDING_WEBHOOK_SCANS` are accepted and not yet finished.
 */
@injectable()
export class FileScannerWorker {
  /** Scans accepted and not yet finished, running or waiting. */
  private pending = 0;
  private running = 0;
  /** Scans waiting for a slot; each is started when a running scan hands its slot over. */
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly loggerService = inject(LoggerService),
    private readonly virusScanner = inject(VirusScannerService),
    private readonly storage = inject(S3StorageClientProvider),
  ) {}

  /**
   * Accepts every object referenced by a webhook notification for scanning, and returns a promise that settles once
   * they are all scanned. Returns `null`, accepting none of them, when that would leave more than
   * `MAX_PENDING_WEBHOOK_SCANS` pending; the caller refuses the notification so the provider can retry.
   */
  handleScanJobs(jobs: StorageScanJob[]): Promise<void> | null {
    if (!this.virusScanner.isEnabled) {
      this.loggerService.log.debug('Antivirus scanning disabled; ignoring storage webhook');
      return Promise.resolve();
    }

    if (this.pending + jobs.length > MAX_PENDING_WEBHOOK_SCANS) {
      this.loggerService.log.warn({ pending: this.pending, refused: jobs.length }, 'Webhook scan queue is full; refusing notification');
      return null;
    }

    this.pending += jobs.length;
    return Promise.all(jobs.map((job) => this.inSlot(() => this.scanObject(job)).finally(() => (this.pending -= 1)))).then(() => undefined);
  }

  /** Runs `task` once one of the `MAX_CONCURRENT_WEBHOOK_SCANS` slots is free; its slot passes straight to the next waiting scan. */
  private async inSlot(task: () => Promise<void>): Promise<void> {
    if (this.running < MAX_CONCURRENT_WEBHOOK_SCANS) {
      this.running += 1;
    } else {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }

    try {
      await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running -= 1;
    }
  }

  private async scanObject({ bucket, key }: StorageScanJob): Promise<void> {
    try {
      const { client } = this.storage;
      await client.setObjectTagging(bucket, key, scanTags(ScanStatus.SCANNING));

      const { stream, contentLength } = await client.getObjectStream(bucket, key);
      // A length storage does not report could be anything, so it counts as over the cap.
      if (contentLength === undefined || contentLength > MAX_WEBHOOK_SCAN_SIZE_BYTES) {
        await stream.cancel();
        this.loggerService.log.warn({ bucket, key, contentLength }, 'Webhook scan skipped an object over the scan size cap');
        await client.setObjectTagging(bucket, key, scanTags(ScanStatus.TOO_LARGE));
        return;
      }

      // Streamed to clamd rather than read into memory first.
      const { result, viruses } = await this.virusScanner.scanStream(Readable.fromWeb(stream as NodeReadableStream<Uint8Array>));

      if (result === ScanResult.INFECTED) {
        this.loggerService.log.warn({ bucket, key, viruses }, 'Webhook scan found an infected object; deleting');
        await client.setObjectTagging(bucket, key, scanTags(ScanStatus.INFECTED, viruses));
        await client.removeObject(bucket, key);
        return;
      }

      const status = result === ScanResult.CLEAN ? ScanStatus.CLEAN : ScanStatus.ERROR;
      await client.setObjectTagging(bucket, key, scanTags(status));
      this.loggerService.log.info({ bucket, key, status }, 'Webhook scan completed');
    } catch (error) {
      this.loggerService.log.error({ error, bucket, key }, 'Failed to scan object from storage webhook');
    }
  }
}
