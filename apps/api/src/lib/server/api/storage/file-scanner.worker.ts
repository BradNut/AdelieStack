import { inject, injectable } from '@needle-di/core';
import { ConfigService } from '../common/configs/config.service';
import { LoggerService } from '../common/services/logger.service';
import { S3StorageClient } from './s3-storage.client';
import { ScanStatus, ScanTag } from './storage.types';
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
  private client: S3StorageClient | undefined;

  constructor(
    private readonly configService = inject(ConfigService),
    private readonly loggerService = inject(LoggerService),
    private readonly virusScanner = inject(VirusScannerService),
  ) {}

  /** Scans every object referenced by a webhook notification. */
  async handleScanJobs(jobs: StorageScanJob[]): Promise<void> {
    if (!this.configService.envs.ANTIVIRUS_ENABLED) {
      this.loggerService.log.debug('Antivirus scanning disabled; ignoring storage webhook');
      return;
    }

    for (const job of jobs) {
      await this.scanObject(job);
    }
  }

  private async scanObject({ bucket, key }: StorageScanJob): Promise<void> {
    try {
      await this.getClient().setObjectTagging(bucket, key, {
        [ScanTag.STATUS]: ScanStatus.SCANNING,
        [ScanTag.TIMESTAMP]: new Date().toISOString(),
      });

      const { body } = await this.getClient().getObject(bucket, key);
      const { result, viruses } = await this.virusScanner.scanBuffer(body);

      if (result === ScanResult.INFECTED) {
        this.loggerService.log.warn({ bucket, key, viruses }, 'Webhook scan found an infected object; deleting');
        await this.getClient().setObjectTagging(bucket, key, {
          [ScanTag.STATUS]: ScanStatus.INFECTED,
          [ScanTag.TIMESTAMP]: new Date().toISOString(),
          ...(viruses?.length ? { [ScanTag.VIRUSES]: viruses.join(',') } : {}),
        });
        await this.getClient().removeObject(bucket, key);
        return;
      }

      const status = result === ScanResult.CLEAN ? ScanStatus.CLEAN : ScanStatus.ERROR;
      await this.getClient().setObjectTagging(bucket, key, {
        [ScanTag.STATUS]: status,
        [ScanTag.TIMESTAMP]: new Date().toISOString(),
      });
      this.loggerService.log.info({ bucket, key, status }, 'Webhook scan completed');
    } catch (error) {
      this.loggerService.log.error({ error, bucket, key }, 'Failed to scan object from storage webhook');
    }
  }

  // Created on first use so constructing the worker never touches storage.
  private getClient(): S3StorageClient {
    this.client ??= S3StorageClient.fromEnv(this.configService.envs);
    return this.client;
  }
}
