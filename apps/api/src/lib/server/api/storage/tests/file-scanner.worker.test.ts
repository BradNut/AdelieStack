import { Container } from '@needle-di/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '../../common/configs/config.service';
import { LoggerService } from '../../common/services/logger.service';
import { FileScannerWorker } from '../file-scanner.worker';
import { S3StorageClient } from '../s3-storage.client';
import { ScanStatus, ScanTag } from '../storage.types';
import { type ScanResponse, ScanResult, VirusScannerService } from '../virus-scanner.service';

const loggerStub = { log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } } as unknown as LoggerService;

const envs = {
  ANTIVIRUS_ENABLED: true,
  STORAGE_HOST: 'localhost',
  STORAGE_PORT: 8333,
  STORAGE_SSL: false,
  STORAGE_ACCESS_KEY: 'key',
  STORAGE_SECRET_KEY: 'secret',
};

const buildWorker = (opts: { enabled?: boolean; scan: ScanResponse }) => {
  const scanBuffer = vi.fn(async () => opts.scan);
  const container = new Container();
  container.bind({ provide: ConfigService, useValue: { envs: { ...envs, ANTIVIRUS_ENABLED: opts.enabled ?? true } } as unknown as ConfigService });
  container.bind({ provide: LoggerService, useValue: loggerStub });
  container.bind({ provide: VirusScannerService, useValue: { scanBuffer } as unknown as VirusScannerService });
  return { worker: container.get(FileScannerWorker), scanBuffer };
};

const JOB = { bucket: 'adelie-public-development', key: 'images/photo.png' };

describe('FileScannerWorker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when antivirus is disabled', async () => {
    const getObject = vi.spyOn(S3StorageClient.prototype, 'getObject');
    const { worker, scanBuffer } = buildWorker({ enabled: false, scan: { result: ScanResult.CLEAN } });

    await worker.handleScanJobs([JOB]);

    expect(scanBuffer).not.toHaveBeenCalled();
    expect(getObject).not.toHaveBeenCalled();
  });

  it('tags a clean object as scanned and leaves it in place', async () => {
    vi.spyOn(S3StorageClient.prototype, 'getObject').mockResolvedValue({ body: Buffer.from('ok'), contentType: 'image/png' });
    const setObjectTagging = vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
    const removeObject = vi.spyOn(S3StorageClient.prototype, 'removeObject').mockResolvedValue();
    const { worker } = buildWorker({ scan: { result: ScanResult.CLEAN } });

    await worker.handleScanJobs([JOB]);

    expect(removeObject).not.toHaveBeenCalled();
    expect(setObjectTagging).toHaveBeenLastCalledWith(JOB.bucket, JOB.key, expect.objectContaining({ [ScanTag.STATUS]: ScanStatus.CLEAN }));
  });

  it('tags and deletes an infected object', async () => {
    vi.spyOn(S3StorageClient.prototype, 'getObject').mockResolvedValue({ body: Buffer.from('bad'), contentType: 'image/png' });
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
});
