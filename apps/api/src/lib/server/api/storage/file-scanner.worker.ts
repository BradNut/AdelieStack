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
 * confirms the scan verdict for objects after they land in storage (including any
 * that bypass the synchronous upload path). Infected objects are tagged and deleted;
 * the outcome is recorded as object tags so reads can trust it without re-scanning.
 */
@injectable()
export class FileScannerWorker {
  constructor(
    private readonly loggerService = inject(LoggerService),
    private readonly virusScanner = inject(VirusScannerService),
    private readonly storage = inject(S3StorageClientProvider),
  ) {}

  /** Scans every object referenced by a webhook notification. */
  async handleScanJobs(jobs: StorageScanJob[]): Promise<void> {
    if (!this.virusScanner.isEnabled) {
      this.loggerService.log.debug('Antivirus scanning disabled; ignoring storage webhook');
      return;
    }

    for (const job of jobs) {
      await this.scanObject(job);
    }
  }

  private async scanObject({ bucket, key }: StorageScanJob): Promise<void> {
    try {
      const { client } = this.storage;
      await client.setObjectTagging(bucket, key, scanTags(ScanStatus.SCANNING));

      const { body } = await client.getObject(bucket, key);
      const { result, viruses } = await this.virusScanner.scanBuffer(body);

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
